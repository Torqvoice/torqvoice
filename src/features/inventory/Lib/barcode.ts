import { db } from "@/lib/db";

/**
 * Canonical form for a stored barcode.
 *
 * Barcodes are unique per organization, so scanning must resolve to exactly one
 * part. Normalising on every write — and applying the same transform to scanned
 * input — makes the match deterministic: "  abc-1 " typed by hand and "ABC-1"
 * from a scanner are the same barcode, and only one part can hold it.
 *
 * Returns null for blank input, which the unique index treats as "no barcode"
 * (Postgres considers NULLs distinct, so any number of parts may have none).
 */
export function normalizeBarcode(
  barcode: string | null | undefined,
): string | null {
  if (barcode == null) return null;
  const trimmed = barcode.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Prisma's unique-constraint violation code. */
const UNIQUE_VIOLATION = "P2002";

function isBarcodeUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: string; meta?: { target?: unknown } };
  if (e.code !== UNIQUE_VIOLATION) return false;
  const target = e.meta?.target;
  const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return fields.includes("barcode");
}

/**
 * Run an inventory write, converting a barcode collision into a message that
 * names the part already using it, rather than leaking a raw Prisma error.
 *
 * `withAuth` turns a thrown Error into `{ success: false, error }`, which the
 * client surfaces as a toast.
 */
export async function withBarcodeConflictMessage<T>(
  organizationId: string,
  barcode: string | null,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isBarcodeUniqueViolation(error)) throw error;

    const existing = barcode
      ? await db.inventoryPart.findFirst({
          where: { organizationId, barcode },
          select: { name: true, partNumber: true },
        })
      : null;

    const label = existing
      ? `${existing.name}${existing.partNumber ? ` (${existing.partNumber})` : ""}`
      : null;

    throw new Error(
      label
        ? `Barcode ${barcode} is already used by ${label}.`
        : `Barcode ${barcode} is already used by another part.`,
    );
  }
}
