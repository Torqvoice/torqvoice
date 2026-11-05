/**
 * Diagnostic trouble codes as text: telling one apart from other words,
 * writing it the one way the app stores it, and reading every code out of
 * whatever a technician pastes from a scan tool.
 *
 * A code is a letter for the system (P powertrain, C chassis, B body,
 * U network), a digit 0 to 3 for who defined it, and three hex digits:
 * P0420, U0100, B1A2F. Stored upper case, with nothing around it.
 */

export const FAULT_CODE_PATTERN = /^[PCBU][0-3][0-9A-F]{3}$/

/** The statuses a scan tool reports a code in. */
export const FAULT_STATUSES = ['stored', 'pending', 'permanent', 'history'] as const
export type FaultStatus = (typeof FAULT_STATUSES)[number]

/** P0420 from " p0420 ", "P0420-00" or "p 0420"; null for anything that is not a code. */
export function normalizeFaultCode(input: string | null | undefined): string | null {
  if (!input) return null
  const squeezed = input.trim().toUpperCase().replace(/\s+/g, '')
  // A failure-type byte some tools print after the code ("P0420-00", "U0100:87").
  const bare = squeezed.replace(/^([PCBU][0-3][0-9A-F]{3})[-:.][0-9A-F]{2}$/, '$1')
  return FAULT_CODE_PATTERN.test(bare) ? bare : null
}

export function isFaultCode(input: string | null | undefined): boolean {
  return normalizeFaultCode(input) !== null
}

/**
 * Whether a code is in a range a manufacturer defines (P1xxx, P30xx to
 * P33xx, B1, B2, C1, C2, U1, U2) rather than one SAE J2012 gives the same
 * meaning on every car. A workshop's own meaning for such a code is usually
 * for one make.
 */
export function isManufacturerCode(code: string): boolean {
  const c = normalizeFaultCode(code)
  if (!c) return false
  const system = c[0]
  const range = c[1]
  if (system === 'P') {
    if (range === '1') return true
    if (range === '3') return /^[0-3]$/.test(c[2])
    return false
  }
  return range === '1' || range === '2'
}

/**
 * Words scan tools print beside a code, to the status the app records. Only
 * words that say the same thing everywhere and never turn up in a code's own
 * title: "current", "active" and "past" do ("circuit current high"), and
 * "intermittent" says nothing a status can hold, so they are left alone.
 */
const STATUS_WORDS: Record<string, FaultStatus> = {
  stored: 'stored',
  confirmed: 'stored',
  pending: 'pending',
  permanent: 'permanent',
  history: 'history',
  historic: 'history',
}

export interface ExtractedCode {
  code: string
  status?: FaultStatus
}

/**
 * A code in running text: a whole word, optionally with the failure-type
 * byte some tools print after it. A code inside a longer word (a VIN, a
 * part number) is not one.
 */
const CODE_IN_TEXT = /(?<![0-9A-Z])([PCBU][0-3][0-9A-F]{3})(?:[-:][0-9A-F]{2})?(?![0-9A-Z])/gi

/**
 * Every code in pasted or typed text, once each, in the order they appear:
 * "p0420, P0171 stored" is P0420 and P0171 (stored). A status word counts
 * for the code it follows, up to the next code or the end of the line, so a
 * list a scan tool exports line by line keeps its statuses.
 */
export function extractFaultCodes(text: string): ExtractedCode[] {
  const out: ExtractedCode[] = []
  const seen = new Map<string, ExtractedCode>()
  const matches = [...text.matchAll(CODE_IN_TEXT)]
  matches.forEach((match, i) => {
    const code = match[1].toUpperCase()
    const start = (match.index ?? 0) + match[0].length
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length
    // The rest of this code's own stretch: to the next code, a line break or a list separator.
    const tail = text.slice(start, end).split(/[\n;,|]/)[0]
    const status = statusIn(tail)
    const existing = seen.get(code)
    if (existing) {
      if (!existing.status && status) existing.status = status
      return
    }
    const entry: ExtractedCode = status ? { code, status } : { code }
    seen.set(code, entry)
    out.push(entry)
  })
  return out
}

function statusIn(text: string): FaultStatus | undefined {
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    const status = STATUS_WORDS[word]
    if (status) return status
  }
  return undefined
}

/**
 * Whether a search looks like a code or the start of one: "p0420", "P042",
 * "u01". Two characters at least, so a lone "p" does not ask the service.
 */
export function looksLikeFaultCode(query: string): boolean {
  const q = query.trim().toUpperCase()
  return /^[PCBU][0-3][0-9A-F]{0,3}$/.test(q) && q.length >= 2
}

/** "P0420 Catalyst efficiency below threshold", as findings with a code print. */
export function faultLine(code: string, meaning: string | null | undefined): string {
  const text = meaning?.trim()
  return text ? `${code} ${text}` : code
}

/**
 * A finding's text as it reads on a print and in the lists: the code and its
 * saved meaning for a code finding, its own description otherwise. A
 * description the technician wrote beyond the code and meaning is kept.
 */
export function findingLine(finding: {
  description: string
  faultCode?: string | null
  faultMeaning?: string | null
}): string {
  if (!finding.faultCode) return finding.description
  const description = finding.description.trim()
  const composed = faultLine(finding.faultCode, finding.faultMeaning)
  if (!description || description === composed || description === finding.faultCode) {
    return composed
  }
  return description.toUpperCase().startsWith(finding.faultCode)
    ? description
    : `${finding.faultCode} ${description}`
}
