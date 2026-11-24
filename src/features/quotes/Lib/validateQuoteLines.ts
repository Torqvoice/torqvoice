import {
  type LaborLineIssues,
  laborLineIssues,
  type PartLineIssues,
  partLineIssues,
} from '@/lib/input-limits'

/**
 * Why a quote's lines cannot be saved, in the words the work order uses for
 * the same thing (service.page.problems), checked in the browser before the
 * save so the person is told at once and the field is marked where it is.
 * The server's schema (quoteSchema) holds the same rules.
 */
export type QuoteLineProblem = 'negative' | 'tooLarge' | 'zeroQuantity'

interface QuotePartLine {
  name: string
  quantity: unknown
  unitPrice: unknown
  unitCost?: unknown
}

interface QuoteLaborLine {
  description: string
  hours: unknown
  rate: unknown
}

/**
 * The first problem with the lines a save would send: parts with a name and
 * labour with a description, since the save leaves out the rest. Negatives
 * first, then figures past the limits, then a priced part at zero, the order
 * the work order checks them in.
 */
export function findQuoteLineProblem(
  parts: readonly QuotePartLine[],
  labor: readonly QuoteLaborLine[]
): QuoteLineProblem | null {
  const issues: (PartLineIssues | LaborLineIssues)[] = [
    ...parts.filter((p) => p.name).map(partLineIssues),
    ...labor.filter((l) => l.description).map(laborLineIssues),
  ]
  const all = issues.flatMap((line) => Object.values(line))
  if (all.some((i) => i?.issue === 'negative')) return 'negative'
  if (all.some((i) => i?.issue === 'tooLarge')) return 'tooLarge'
  if (all.some((i) => i?.issue === 'positive')) return 'zeroQuantity'
  return null
}
