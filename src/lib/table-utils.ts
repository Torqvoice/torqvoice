export const typeColors: Record<string, string> = {
  maintenance: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  repair: 'bg-red-500/10 text-red-500 border-red-500/20',
  upgrade: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  inspection: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
}

export const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  'in-progress': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'waiting-parts': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
}

/**
 * Width for a column in a fixed-layout table, sized from what it holds.
 *
 * Lists use `table-fixed` so their text columns can truncate, which means a
 * short column cannot size itself, and a fixed pixel width breaks as soon as
 * a translation is longer than the English (the header spills into the next
 * column). This takes the longer of the header label and the widest cell on
 * the page. `cellScale` is how wide a cell character is next to a header
 * character: about 1 for text-sm monospace, 0.85 for text-xs monospace. The
 * rem covers the cell padding and the sort icon.
 */
export function fitColumnWidth(
  label: string,
  cells: readonly (string | number | null | undefined)[] = [],
  cellScale = 1
): string {
  const longestCell = Math.max(0, ...cells.map((c) => String(c ?? '-').length))
  return `calc(${Math.max(label.length, longestCell * cellScale)}ch + 2.5rem)`
}
