/**
 * The rows of a labour preset that stop it being saved for want of a name.
 *
 * A row with nothing in it is the spare line the form keeps ready, and is
 * dropped on save without a word. A row with hours or a description and no
 * name was meant, and saying "at least one item is required" about it, with
 * the item right there, told the person nothing: it is marked instead, under
 * its own name field. When no row has a name at all, the first one is
 * marked, since a preset needs one.
 *
 * Pure, so the rule is tested without the dialog.
 */
export interface PresetRow {
  /** What the row is called: the name of a single item, the description of a package line. */
  name: string
  /** A single item's longer description, when it has one. */
  description?: string
  hours: number | string
}

export function namelessItemRows(rows: PresetRow[]): number[] {
  const hasContent = (row: PresetRow) => Boolean(row.description?.trim()) || Number(row.hours) > 0
  const nameless = rows.flatMap((row, i) => (!row.name.trim() && hasContent(row) ? [i] : []))
  if (nameless.length > 0) return nameless
  if (rows.length > 0 && !rows.some((row) => row.name.trim())) return [0]
  return []
}
