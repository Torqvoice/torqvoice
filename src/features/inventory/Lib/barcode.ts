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

/**
 * Collect every place Prisma might name the violated columns.
 *
 * The shape is not stable across Prisma versions or driver setups. Classic
 * Prisma puts the columns in `meta.target`; Prisma 7 with the pg driver adapter
 * leaves `target` undefined and reports them under
 * `meta.driverAdapterError.cause.constraint.fields`, alongside the raw Postgres
 * message naming the index.
 *
 * Reading all of them means a future shape change degrades to "we did not
 * recognise it" rather than silently leaking a raw Prisma error at the user —
 * which is exactly what happened when only `target` was checked.
 */
export function uniqueViolationFields(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const e = error as {
    code?: string;
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: {
          originalMessage?: string;
          constraint?: { fields?: unknown; index?: unknown };
        };
      };
    };
  };
  if (e.code !== UNIQUE_VIOLATION) return "";

  const parts: string[] = [];

  const target = e.meta?.target;
  if (Array.isArray(target)) parts.push(target.join(","));
  else if (target != null) parts.push(String(target));

  const cause = e.meta?.driverAdapterError?.cause;
  const fields = cause?.constraint?.fields;
  if (Array.isArray(fields)) parts.push(fields.join(","));
  if (cause?.constraint?.index != null) parts.push(String(cause.constraint.index));
  if (cause?.originalMessage) parts.push(cause.originalMessage);

  return parts.join("|");
}

function isBarcodeUniqueViolation(error: unknown): boolean {
  return uniqueViolationFields(error).includes("barcode");
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
