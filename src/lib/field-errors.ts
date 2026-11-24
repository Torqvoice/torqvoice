import type { ZodError } from 'zod'

/**
 * What was wrong with one field a server action refused, in a form any
 * screen can put into words in the person's own language.
 *
 * The action's zod schema says what is wrong in library English ("Too small:
 * expected number to be >=0") under the field's code name ("mileage"). That
 * is what the error string carries, for the log. The form gets this instead:
 * the field, a kind of problem it has words for, and the number the rule
 * stopped at, so the message can sit under the field it is about.
 */
export type FieldIssue =
  | 'required'
  | 'email'
  | 'tooShort'
  | 'tooLong'
  | 'negative'
  /** Above zero: a priced part's quantity. */
  | 'positive'
  | 'tooSmall'
  | 'tooLarge'
  | 'notNumber'
  | 'wholeNumber'
  | 'phone'
  | 'invalid'

export interface FieldError {
  /** The field's path in the action's input, dotted: "email", "partItems.2.quantity". */
  field: string
  issue: FieldIssue
  /** The limit the rule stopped at: the length, the smallest or the largest value. */
  limit?: number
}

type Issue = ZodError['issues'][number]

/** The kinds a rule of the app's own may name, beyond what zod reports itself. */
const NAMED_ISSUES = new Set<FieldIssue>(['phone'])

function issueOf(issue: Issue): Pick<FieldError, 'issue' | 'limit'> {
  switch (issue.code) {
    case 'too_small': {
      const minimum = Number(issue.minimum)
      if (issue.origin === 'string') {
        return minimum <= 1 ? { issue: 'required' } : { issue: 'tooShort', limit: minimum }
      }
      if (issue.origin === 'array' || issue.origin === 'set') return { issue: 'required' }
      if (minimum === 0 && issue.inclusive !== false) return { issue: 'negative' }
      if (minimum === 0) return { issue: 'positive' }
      return { issue: 'tooSmall', limit: minimum }
    }
    case 'too_big': {
      const maximum = Number(issue.maximum)
      if (issue.origin === 'string') return { issue: 'tooLong', limit: maximum }
      return { issue: 'tooLarge', limit: maximum }
    }
    case 'invalid_format':
      return issue.format === 'email' ? { issue: 'email' } : { issue: 'invalid' }
    case 'invalid_type':
      // An integer rule fails this way on a number with decimals.
      if (issue.expected === 'int') return { issue: 'wholeNumber' }
      // A number box sent empty or with letters arrives as undefined or NaN.
      if (issue.expected === 'number') return { issue: 'notNumber' }
      return { issue: 'invalid' }
    case 'custom': {
      // A rule of the app's own names the kind of problem it is, so the
      // form can say it: `refine(check, { params: { fieldIssue: 'phone' } })`.
      const named = (issue.params as { fieldIssue?: unknown } | undefined)?.fieldIssue
      return typeof named === 'string' && NAMED_ISSUES.has(named as FieldIssue)
        ? { issue: named as FieldIssue }
        : { issue: 'invalid' }
    }
    default:
      return { issue: 'invalid' }
  }
}

/** One problem per field, the first the schema found, in the order it found them. */
export function fieldErrorsFromZod(error: ZodError): FieldError[] {
  const out: FieldError[] = []
  const seen = new Set<string>()
  for (const issue of error.issues) {
    const field = issue.path.map(String).join('.')
    if (!field || seen.has(field)) continue
    seen.add(field)
    out.push({ field, ...issueOf(issue) })
  }
  return out
}
