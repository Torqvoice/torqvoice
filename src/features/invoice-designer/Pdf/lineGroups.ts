/**
 * The groups a sheet divides its lines into when a table groups by category.
 *
 * Computed once by each print builder from the real lines and handed to the
 * spec as worded strings, like everything else the document prints; the
 * spec builder only orders rows under the headings it is given. A line's
 * `group` names its entry here, so the parts table and the combined items
 * table read the same division.
 */

import type { LineGroup } from '../Spec/buildSpec'

/** The group a part line belongs to: its category, or the catch-all. */
export function partGroupKey(category: string | null | undefined): string {
  const name = category?.trim()
  return name ? `category:${name}` : OTHER_PARTS_GROUP
}

export const OTHER_PARTS_GROUP = 'other'
export const LABOR_GROUP = 'labor'

interface GroupInput {
  parts: { category?: string | null; total: number; excluded?: boolean; taxable?: boolean | null }[]
  labor: { total: number; excluded?: boolean; taxable?: boolean | null }[]
  labels: Record<string, string>
  /**
   * A line total as the sheet shows it, before and after tax alike. A line
   * left out of the tax is shown as entered, so the caller is told which.
   */
  shown: (amount: number, taxable?: boolean) => number
  money: (amount: number) => string
}

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((str, [key, val]) => str.replace(`{${key}}`, val), template)
}

/**
 * Labor first, as the flat list prints it, then one group per category in
 * the order the categories first appear, then the parts with no category.
 * Nothing at all when no part has a category: a sheet asked to group then
 * prints flat rather than under a single heading that says nothing.
 */
export function lineGroupsFor(input: GroupInput): LineGroup[] | undefined {
  const { labels, shown, money } = input
  const L = (key: string, fallback: string) => labels[key] || fallback
  if (!input.parts.some((part) => part.category?.trim())) return undefined

  type Line = { total: number; excluded?: boolean; taxable?: boolean | null }
  // Each line converted on its own and then added, since a group can hold
  // taxed and untaxed lines side by side.
  const subtotalOf = (lines: Line[]) =>
    money(
      lines.reduce(
        (sum, line) => (line.excluded ? sum : sum + shown(line.total, line.taxable !== false)),
        0
      )
    )
  const group = (key: string, title: string, lines: Line[]) => ({
    key,
    title,
    subtotalLabel: fill(L('groupSubtotal', '{group} subtotal'), { group: title }),
    subtotal: subtotalOf(lines),
  })

  const groups: LineGroup[] = []
  if (input.labor.length) groups.push(group(LABOR_GROUP, L('labor', 'Labor'), input.labor))

  const byCategory = new Map<string, { title: string; lines: GroupInput['parts'] }>()
  const other: GroupInput['parts'] = []
  for (const part of input.parts) {
    const key = partGroupKey(part.category)
    if (key === OTHER_PARTS_GROUP) {
      other.push(part)
      continue
    }
    const entry = byCategory.get(key) ?? { title: part.category?.trim() ?? '', lines: [] }
    entry.lines.push(part)
    byCategory.set(key, entry)
  }
  for (const [key, entry] of byCategory) groups.push(group(key, entry.title, entry.lines))
  if (other.length) groups.push(group(OTHER_PARTS_GROUP, L('otherParts', 'Other parts'), other))
  return groups
}
