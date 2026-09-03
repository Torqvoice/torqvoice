/**
 * The placeholders a reminder template may use, and how they are filled.
 * Unknown placeholders are left as typed so a typo shows up in the preview
 * rather than vanishing.
 */
export const TEMPLATE_PLACEHOLDERS = [
  'customerName',
  'vehicle',
  'plate',
  'dueDate',
  'workshopName',
  'bookingLink',
  'phone',
] as const

export type TemplateValues = Record<(typeof TEMPLATE_PLACEHOLDERS)[number], string>

/**
 * Each placeholder mapped to itself in braces. Translated strings that
 * quote a placeholder literally, such as the default templates and the
 * hint listing them, are formatted with this so next-intl leaves the
 * braces in place instead of demanding a value.
 */
export const PLACEHOLDER_TOKENS: TemplateValues = Object.fromEntries(
  TEMPLATE_PLACEHOLDERS.map((key) => [key, `{${key}}`])
) as TemplateValues

export function renderTemplate(template: string, values: TemplateValues): string {
  return template
    .replace(/\{(\w+)\}/g, (match, key: string) =>
      key in values ? values[key as keyof TemplateValues] : match
    )
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/** Placeholders present in a template that the values cannot fill. */
export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(TEMPLATE_PLACEHOLDERS)
  const out = new Set<string>()
  for (const m of template.matchAll(/\{(\w+)\}/g)) if (!known.has(m[1])) out.add(m[1])
  return [...out]
}

/** The GSM-7 basic set, as code points. Anything outside it makes an SMS UCS-2. */
const GSM_EXTRA = new Set(
  '@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&\'()*+,-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~]|€'
    .split('')
    .map((c) => c.codePointAt(0) as number)
)
function isGsm7(body: string): boolean {
  for (const ch of body) {
    const cp = ch.codePointAt(0) as number
    const basic = (cp >= 0x20 && cp <= 0x7e) || cp === 0x0a || cp === 0x0d
    if (!basic && !GSM_EXTRA.has(cp)) return false
  }
  return true
}

/** How many SMS segments a body costs: 160 or 70 characters for one, fewer per part after that. */
export function smsSegments(body: string): number {
  const gsm = isGsm7(body)
  const single = gsm ? 160 : 70
  const multi = gsm ? 153 : 67
  const length = [...body].length
  if (length <= single) return 1
  return Math.ceil(length / multi)
}
