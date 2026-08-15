import "server-only";

import { readFile } from "fs/promises";
import sharp from "sharp";
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

interface PhotoSourceItem {
  id: string;
  condition: string;
  imageUrls: string[];
  sortOrder: number;
}

async function loadPhoto(url: string): Promise<InspectionPhoto | null> {
  try {
    const buffer = await readFile(resolveUploadPath(url));
    const resized = await sharp(buffer)
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

    const loaded = (await Promise.all(affordable.map(loadPhoto))).filter(
      (photo): photo is InspectionPhoto => photo !== null
    );
    if (loaded.length > 0) {
      photos[item.id] = loaded;
      budget -= loaded.length;
    }
  }

  return { photos, omitted };
}
