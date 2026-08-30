/**
 * The defect vocabulary an inspection is graded against.
 *
 * Directive 2014/45/EU Article 7(2) puts every deficiency found during a
 * roadworthiness test into one of three categories:
 *
 *   minor      no significant effect on the safety of the vehicle and no other
 *              non-compliance; the vehicle passes
 *   major      may prejudice the safety of the vehicle, affect the environment
 *              or put other road users at risk; the vehicle fails and must be
 *              repaired and retested
 *   dangerous  a direct and immediate risk to road safety; the vehicle must not
 *              be used on the public road
 *
 * The stored values keep the names the app has always used, so no existing row
 * has to be rewritten: `attention` is the minor category and `fail` is the
 * major one. Only `dangerous` is new. Templates that predate the EU scale keep
 * grading on the `basic` scale and never offer the dangerous step.
 */
export const CONDITIONS = ['pass', 'attention', 'fail', 'dangerous', 'not_inspected'] as const

export type Condition = (typeof CONDITIONS)[number]

export type SeverityScale = 'eu' | 'basic'

/** Grading steps offered to the technician, worst last. */
export const SCALE_STEPS: Record<SeverityScale, Condition[]> = {
  eu: ['pass', 'attention', 'fail', 'dangerous'],
  basic: ['pass', 'attention', 'fail'],
}

/** Higher means worse. Used to roll section and inspection results up. */
const SEVERITY_RANK: Record<Condition, number> = {
  not_inspected: -1,
  pass: 0,
  attention: 1,
  fail: 2,
  dangerous: 3,
}

export function isDefect(condition: string): boolean {
  return condition === 'attention' || condition === 'fail' || condition === 'dangerous'
}

/** A defect serious enough that the vehicle fails the test. */
export function isFailingDefect(condition: string): boolean {
  return condition === 'fail' || condition === 'dangerous'
}

export function worstCondition(conditions: string[]): Condition {
  let worst: Condition = 'not_inspected'
  for (const c of conditions) {
    const candidate = (CONDITIONS as readonly string[]).includes(c)
      ? (c as Condition)
      : 'not_inspected'
    if (SEVERITY_RANK[candidate] > SEVERITY_RANK[worst]) worst = candidate
  }
  return worst
}

/**
 * Presentation tokens for a condition.
 *
 * Colour is never the only carrier of meaning (WCAG 2.1 SC 1.4.1): every use
 * pairs these with the icon and the text label. Foreground/background pairs are
 * chosen to clear 4.5:1 in both themes — e.g. amber-800 on amber-50 rather than
 * the amber-600-on-white the page used before, which sat around 3.4:1.
 */
export interface ConditionToken {
  /** i18n key suffix and stable identifier. */
  key: Condition
  /** English label for the EU scale. */
  label: string
  /** English label for the legacy three-step scale. */
  basicLabel: string
  /** Short form for dense UI (segmented control, table cells). */
  short: string
  /** What the grade means, shown as help text. */
  hint: string
  /** Quiet treatment: tinted surface, used for badges and item rows. */
  soft: string
  /** Loud treatment: solid fill, used for the selected segment. */
  solid: string
  /** Bare foreground colour for text and icons on the page background. */
  fg: string
  /** Plain hex pair for the PDF, which has no Tailwind and no dark mode. */
  pdf: { bg: string; text: string }
  /** Fill used in the progress rail. */
  bar: string
}

export const CONDITION_TOKENS: Record<Condition, ConditionToken> = {
  pass: {
    key: 'pass',
    label: 'No defect',
    basicLabel: 'Pass',
    short: 'OK',
    hint: 'Meets requirements. Nothing to report.',
    soft: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900',
    solid:
      'bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-600',
    fg: 'text-emerald-800 dark:text-emerald-300',
    pdf: { bg: '#dcfce7', text: '#14532d' },
    bar: 'bg-emerald-600',
  },
  attention: {
    key: 'attention',
    label: 'Minor defect',
    basicLabel: 'Attention',
    short: 'Minor',
    hint: 'No significant effect on safety. Vehicle passes; repair when convenient.',
    soft: 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
    solid: 'bg-amber-700 text-white border-amber-700 dark:bg-amber-600 dark:border-amber-600',
    fg: 'text-amber-900 dark:text-amber-300',
    pdf: { bg: '#fef9c3', text: '#713f12' },
    bar: 'bg-amber-500',
  },
  fail: {
    key: 'fail',
    label: 'Major defect',
    basicLabel: 'Fail',
    short: 'Major',
    hint: 'May prejudice safety or affect the environment. Vehicle fails; repair and retest.',
    soft: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900',
    solid: 'bg-red-700 text-white border-red-700 dark:bg-red-600 dark:border-red-600',
    fg: 'text-red-800 dark:text-red-300',
    pdf: { bg: '#fee2e2', text: '#7f1d1d' },
    bar: 'bg-red-600',
  },
  dangerous: {
    key: 'dangerous',
    label: 'Dangerous defect',
    basicLabel: 'Dangerous',
    short: 'Danger',
    hint: 'Direct and immediate risk to road safety. The vehicle must not be driven.',
    soft: 'bg-red-100 text-red-950 border-red-400 dark:bg-red-900 dark:text-red-50 dark:border-red-700',
    solid: 'bg-red-900 text-white border-red-900 dark:bg-red-800 dark:border-red-800',
    fg: 'text-red-900 dark:text-red-200',
    pdf: { bg: '#fecaca', text: '#450a0a' },
    bar: 'bg-red-900',
  },
  not_inspected: {
    key: 'not_inspected',
    label: 'Not inspected',
    basicLabel: 'Not inspected',
    short: '—',
    hint: 'This check has not been carried out.',
    soft: 'bg-muted text-muted-foreground border-border',
    solid: 'bg-slate-600 text-white border-slate-600',
    fg: 'text-muted-foreground',
    pdf: { bg: '#f3f4f6', text: '#374151' },
    bar: 'bg-muted-foreground/25',
  },
}

export function conditionLabel(condition: string, scale: SeverityScale = 'eu'): string {
  const token = CONDITION_TOKENS[condition as Condition] ?? CONDITION_TOKENS.not_inspected
  return scale === 'basic' ? token.basicLabel : token.label
}

/* -------------------------------------------------------------------------- */
/* National grade numbering                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Numeric defect codes, by country.
 *
 * Directive 2014/45/EU names its categories but does not number them, so there
 * is no EU-wide numbering to fall back on. Member states that do number them
 * are listed here individually, and a country that is not listed simply shows
 * the wording — which is correct, rather than inventing a scheme.
 *
 * Norway's EU-kontroll numbers every check on the kontrollseddel:
 *   0  ingen mangel — godkjent
 *   1  mindre mangel — godkjent med merknad, ingen etterkontroll
 *   2  vesentlig mangel — ikke godkjent, må rettes og etterkontrolleres
 *   3  farlig mangel — bruksforbud
 *   4  ikke kontrollert
 *
 * Do not add a country here without checking its own regulator: Germany's
 * Hauptuntersuchung, for one, categorises defects without numbering them this
 * way, so guessing would put a wrong code on a legal document.
 */
export const GRADE_SCHEMES: Record<string, Partial<Record<Condition, number>>> = {
  NO: { pass: 0, attention: 1, fail: 2, dangerous: 3, not_inspected: 4 },
}

/** The national defect code, or null where the country does not number them. */
export function conditionGrade(
  condition: string,
  scale: SeverityScale = 'eu',
  country?: string | null
): number | null {
  if (scale === 'basic' || !country) return null
  const scheme = GRADE_SCHEMES[country]
  if (!scheme) return null
  const grade = scheme[condition as Condition]
  return grade === undefined ? null : grade
}

/** "2 — Vesentlig mangel", or just the wording where there is no numbering. */
export function gradedConditionLabel(
  condition: string,
  scale: SeverityScale = 'eu',
  country?: string | null,
  label?: string
): string {
  const text = label ?? conditionLabel(condition, scale)
  const grade = conditionGrade(condition, scale, country)
  return grade === null ? text : `${grade} — ${text}`
}

/* -------------------------------------------------------------------------- */
/* Overall test result                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Article 7(3): the outcome of the test follows the worst deficiency found.
 * A vehicle with only minor deficiencies still passes.
 */
export type TestResult = 'pass' | 'pass_minor' | 'fail' | 'fail_dangerous' | 'incomplete'

export interface TestResultToken {
  key: TestResult
  label: string
  /** The consequence for the vehicle owner, in plain language. */
  detail: string
  soft: string
  fg: string
  pdf: { bg: string; text: string }
}

export const TEST_RESULT_TOKENS: Record<TestResult, TestResultToken> = {
  pass: {
    key: 'pass',
    label: 'Pass',
    detail: 'No deficiencies were found.',
    soft: 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800',
    fg: 'text-emerald-800 dark:text-emerald-300',
    pdf: { bg: '#dcfce7', text: '#14532d' },
  },
  pass_minor: {
    key: 'pass_minor',
    label: 'Pass with minor defects',
    detail: 'The vehicle passes. Repair the minor deficiencies without undue delay.',
    soft: 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
    fg: 'text-amber-900 dark:text-amber-300',
    pdf: { bg: '#fef9c3', text: '#713f12' },
  },
  fail: {
    key: 'fail',
    label: 'Fail — major defects',
    detail: 'The vehicle fails. The deficiencies must be repaired and the vehicle retested.',
    soft: 'bg-red-50 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-100 dark:border-red-800',
    fg: 'text-red-800 dark:text-red-300',
    pdf: { bg: '#fee2e2', text: '#7f1d1d' },
  },
  fail_dangerous: {
    key: 'fail_dangerous',
    label: 'Fail — dangerous defects',
    detail:
      'The vehicle must not be used on the public road until the dangerous deficiencies are repaired.',
    soft: 'bg-red-100 text-red-950 border-red-500 dark:bg-red-900 dark:text-red-50 dark:border-red-600',
    fg: 'text-red-900 dark:text-red-200',
    pdf: { bg: '#fecaca', text: '#450a0a' },
  },
  incomplete: {
    key: 'incomplete',
    label: 'Not completed',
    detail: 'The inspection is still in progress.',
    soft: 'bg-muted text-foreground border-border',
    fg: 'text-muted-foreground',
    pdf: { bg: '#f3f4f6', text: '#374151' },
  },
}

export interface ConditionCounts {
  total: number
  inspected: number
  pass: number
  attention: number
  fail: number
  dangerous: number
  notInspected: number
}

export function countConditions(items: { condition: string }[]): ConditionCounts {
  const counts: ConditionCounts = {
    total: items.length,
    inspected: 0,
    pass: 0,
    attention: 0,
    fail: 0,
    dangerous: 0,
    notInspected: 0,
  }
  for (const item of items) {
    switch (item.condition) {
      case 'pass':
        counts.pass++
        counts.inspected++
        break
      case 'attention':
        counts.attention++
        counts.inspected++
        break
      case 'fail':
        counts.fail++
        counts.inspected++
        break
      case 'dangerous':
        counts.dangerous++
        counts.inspected++
        break
      default:
        counts.notInspected++
    }
  }
  return counts
}

/**
 * Derives the overall test result. `requireAllInspected` reports `incomplete`
 * while checks are still outstanding, which is what the in-progress page wants;
 * the certificate passes `false` because a completed inspection may legitimately
 * leave non-applicable checks ungraded.
 */
export function deriveTestResult(
  items: { condition: string }[],
  { requireAllInspected = false }: { requireAllInspected?: boolean } = {}
): TestResult {
  const counts = countConditions(items)
  if (counts.inspected === 0) return 'incomplete'
  if (requireAllInspected && counts.notInspected > 0) return 'incomplete'
  if (counts.dangerous > 0) return 'fail_dangerous'
  if (counts.fail > 0) return 'fail'
  if (counts.attention > 0) return 'pass_minor'
  return 'pass'
}

/* -------------------------------------------------------------------------- */
/* Measurements                                                               */
/* -------------------------------------------------------------------------- */

export type InputType = 'condition' | 'measurement' | 'text' | 'choice'

export const INPUT_TYPES: { value: InputType; label: string; hint: string }[] = [
  {
    value: 'condition',
    label: 'Defect grading',
    hint: 'Technician grades the check against the defect scale.',
  },
  {
    value: 'measurement',
    label: 'Measurement',
    hint: 'Records a number in a unit, graded automatically against a range.',
  },
  {
    value: 'text',
    label: 'Free text',
    hint: 'Records a written observation, e.g. a tyre brand or a fault code.',
  },
  { value: 'choice', label: 'Choice', hint: 'Technician picks one of a fixed list of answers.' },
]

/** Units offered in the builder. Free text is still allowed. */
export const COMMON_UNITS = [
  'mm',
  'cm',
  'bar',
  'psi',
  '%',
  'V',
  'A',
  'Nm',
  '°C',
  'kg',
  'l',
  'dB',
  'm⁻¹',
]

/**
 * Grades a measurement against the check's allowed range. Out-of-range readings
 * take the check's configured severity so a template can say, for example, that
 * tread below 1.6 mm is a major defect while a slightly low battery is minor.
 */
export function gradeMeasurement(
  value: number | null | undefined,
  check: { minValue?: number | null; maxValue?: number | null; defaultSeverity?: string | null }
): Condition | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  const { minValue, maxValue } = check
  if (minValue === null && maxValue === null) return null
  if (minValue === undefined && maxValue === undefined) return null

  const belowMin = minValue !== null && minValue !== undefined && value < minValue
  const aboveMax = maxValue !== null && maxValue !== undefined && value > maxValue
  if (!belowMin && !aboveMax) return 'pass'

  const severity = check.defaultSeverity
  return severity === 'dangerous' || severity === 'fail' || severity === 'attention'
    ? severity
    : 'fail'
}

/** "1.6–8 mm", "min 1.6 mm", "max 4 bar" — the range shown next to the input. */
export function formatRange(check: {
  minValue?: number | null
  maxValue?: number | null
  unit?: string | null
}): string | null {
  const { minValue, maxValue, unit } = check
  const suffix = unit ? ` ${unit}` : ''
  const hasMin = minValue !== null && minValue !== undefined
  const hasMax = maxValue !== null && maxValue !== undefined
  if (hasMin && hasMax) return `${minValue}–${maxValue}${suffix}`
  if (hasMin) return `min ${minValue}${suffix}`
  if (hasMax) return `max ${maxValue}${suffix}`
  return null
}

/* -------------------------------------------------------------------------- */
/* Vehicle categories (Regulation (EU) 2018/858 / Directive 2014/45/EU Art. 2) */
/* -------------------------------------------------------------------------- */

export const VEHICLE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'M1', label: 'M1 — Passenger car (up to 8 seats)' },
  { value: 'M2', label: 'M2 — Bus or coach, up to 5 t' },
  { value: 'M3', label: 'M3 — Bus or coach, over 5 t' },
  { value: 'N1', label: 'N1 — Goods vehicle, up to 3.5 t' },
  { value: 'N2', label: 'N2 — Goods vehicle, 3.5 t to 12 t' },
  { value: 'N3', label: 'N3 — Goods vehicle, over 12 t' },
  { value: 'O1', label: 'O1 — Trailer, up to 0.75 t' },
  { value: 'O2', label: 'O2 — Trailer, 0.75 t to 3.5 t' },
  { value: 'O3', label: 'O3 — Trailer, 3.5 t to 10 t' },
  { value: 'O4', label: 'O4 — Trailer, over 10 t' },
  { value: 'L3e', label: 'L3e — Motorcycle' },
  { value: 'L4e', label: 'L4e — Motorcycle with sidecar' },
  { value: 'L5e', label: 'L5e — Powered tricycle' },
  { value: 'L7e', label: 'L7e — Heavy quadricycle' },
  { value: 'T', label: 'T — Wheeled tractor' },
]
