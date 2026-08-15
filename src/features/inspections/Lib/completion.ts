import { isDefect } from './conditions'

/**
 * What still stands between an inspection and being completed.
 *
 * A template can mark a check as mandatory, or as needing a photo whenever a
 * defect is recorded against it. Both are promises the report makes to whoever
 * reads it — that the check was actually carried out, and that the defect is
 * evidenced — so they are enforced rather than merely displayed. The same
 * function runs on the page and in `completeInspection`, so the button and the
 * server can never disagree about whether a job is finishable.
 */

export interface CompletionCandidate {
  id: string
  name: string
  code?: string | null
  condition: string
  required?: boolean | null
  photoRequired?: boolean | null
  photoCount: number
}

export interface CompletionBlocker {
  id: string
  /** "1.1.13 Brake linings and pads" */
  label: string
  reason: 'missing-grade' | 'missing-photo'
}

export function findCompletionBlockers(items: CompletionCandidate[]): CompletionBlocker[] {
  const blockers: CompletionBlocker[] = []
  for (const item of items) {
    const label = item.code ? `${item.code} ${item.name}` : item.name
    if (item.required && item.condition === 'not_inspected') {
      blockers.push({ id: item.id, label, reason: 'missing-grade' })
      continue
    }
    if (item.photoRequired && isDefect(item.condition) && item.photoCount === 0) {
      blockers.push({ id: item.id, label, reason: 'missing-photo' })
    }
  }
  return blockers
}

export function describeBlocker(reason: CompletionBlocker['reason']): string {
  return reason === 'missing-grade' ? 'must be graded' : 'needs a photo of the defect'
}

/** One sentence naming what is outstanding, for the error a server action throws. */
export function summariseBlockers(blockers: CompletionBlocker[], limit = 3): string {
  const named = blockers.slice(0, limit).map((b) => `${b.label} (${describeBlocker(b.reason)})`)
  const rest = blockers.length - named.length
  const tail = rest > 0 ? `, and ${rest} more` : ''
  return `${blockers.length} check${blockers.length === 1 ? '' : 's'} still outstanding: ${named.join('; ')}${tail}.`
}
