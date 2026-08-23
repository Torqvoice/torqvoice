/**
 * Turning a backup row back into something Prisma will accept.
 *
 * Rows in a backup are Prisma output, so their field names already match the
 * table they came from. Two things do not survive the trip through JSON: the
 * nested arrays an `include` added, which belong to their own tables, and
 * dates, which arrive as strings.
 */

/** A full ISO timestamp, which is what JSON.stringify makes of a Date. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export function columnsOf(
  row: Record<string, unknown>,
  override: Record<string, unknown> = {}
): Record<string, unknown> {
  const columns: Record<string, unknown> = {}

  for (const [field, value] of Object.entries(row)) {
    if (Array.isArray(value) || value === undefined) continue
    columns[field] = typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value
  }

  // The organisation and the user importing are this instance's, never the
  // ones the file was written on.
  return { ...columns, ...override }
}
