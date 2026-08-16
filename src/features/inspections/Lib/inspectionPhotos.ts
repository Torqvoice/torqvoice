import "server-only";

import { readFile } from "fs/promises";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { isDefect } from "./conditions";

/**
 * Loads inspection photos as data URIs for the PDF certificate.
 *
 * @react-pdf/renderer cannot fetch a protected URL, so every photo has to be
 * embedded. Embedding them at full size is not an option either: a full Annex I
 * sheet can carry a photo per check, and phone cameras produce several megabytes
 * apiece, which would make a certificate nobody can email. Each one is therefore
 * re-encoded down to something that still reads clearly on an A4 page.
 */

const MAX_WIDTH = 900;
const JPEG_QUALITY = 72;
/** Photos embedded per check. */
const PER_ITEM_LIMIT = 3;
/** Photos embedded per certificate, across all checks. */
const DOCUMENT_LIMIT = 40;

const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url);

export interface InspectionPhoto {
  dataUri: string;
}

/**
 * sharp is a native module, so it is the one dependency here that can fail on
 * the machine rather than on the data — a musl/glibc mismatch or a partially
 * copied node_modules after a deploy. Imported lazily and behind a catch so
 * that failure costs the photos rather than the certificate: a report a
 * workshop issued years ago must still download on an install where the image
 * pipeline is broken. A static import would throw while the route module is
 * being evaluated, before any handler's try/catch exists, which the client
 * sees as an empty 500 with nothing in it to explain itself.
 */
type SharpFactory = (typeof import("sharp"))["default"];
let cachedSharp: SharpFactory | null | undefined;

async function getSharp(): Promise<SharpFactory | null> {
  if (cachedSharp !== undefined) return cachedSharp;
  try {
    const loaded = (await import("sharp")).default;
    // libvips defaults to one thread per core and holds a cache per thread,
    // which on a small box is a lot of memory for something that runs a few
    // times a day.
    loaded.concurrency(1);
    cachedSharp = loaded;
  } catch (error) {
    console.error(
      "[Inspection photos] sharp is unavailable; certificates will render without photos:",
      error
    );
    cachedSharp = null;
  }
  return cachedSharp;
}

interface PhotoSourceItem {
  id: string;
  condition: string;
  imageUrls: string[];
  sortOrder: number;
}

async function loadPhoto(url: string): Promise<InspectionPhoto | null> {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    const buffer = await readFile(resolveUploadPath(url));
    const resized = await sharp(buffer, { sequentialRead: true })
      .rotate() // honour the EXIF orientation before it is stripped
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return { dataUri: `data:image/jpeg;base64,${resized.toString("base64")}` };
  } catch {
    // A missing or unreadable file must not take the whole certificate down.
    return null;
  }
}

/**
 * Photos keyed by inspection item id.
 *
 * When there are more photos than the document budget allows, defects are
 * loaded first: a photo of a dangerous defect is evidence, whereas a photo of a
 * check that passed is a nicety. Whatever is dropped is reported in `omitted`
 * so the certificate can say so rather than quietly appearing complete.
 */
export async function loadInspectionPhotos(
  items: PhotoSourceItem[]
): Promise<{ photos: Record<string, InspectionPhoto[]>; omitted: number }> {
  const candidates = items
    .filter((item) => item.condition !== "not_inspected")
    .map((item) => ({
      item,
      urls: (item.imageUrls ?? []).filter((url) => !isVideo(url)),
    }))
    .filter((entry) => entry.urls.length > 0)
    .sort((a, b) => {
      const aDefect = isDefect(a.item.condition) ? 0 : 1;
      const bDefect = isDefect(b.item.condition) ? 0 : 1;
      return aDefect - bDefect || a.item.sortOrder - b.item.sortOrder;
    });

  const photos: Record<string, InspectionPhoto[]> = {};
  let budget = DOCUMENT_LIMIT;
  let omitted = 0;

  for (const { item, urls } of candidates) {
    const wanted = urls.slice(0, PER_ITEM_LIMIT);
    omitted += urls.length - wanted.length;

    const affordable = wanted.slice(0, Math.max(budget, 0));
    omitted += wanted.length - affordable.length;
    if (affordable.length === 0) continue;

    // One at a time: decoding is where the memory goes, and a phone photo
    // expands to tens of megabytes uncompressed. A certificate is worth a
    // second of extra wall clock; it is not worth an out-of-memory kill on a
    // box that is also serving the rest of the workshop.
    const loaded: InspectionPhoto[] = [];
    for (const url of affordable) {
      const photo = await loadPhoto(url);
      if (photo) loaded.push(photo);
    }
    if (loaded.length > 0) {
      photos[item.id] = loaded;
      budget -= loaded.length;
    }
  }

  return { photos, omitted };
}
