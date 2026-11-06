/**
 * Diagnostic trouble codes as text: telling one apart from other words,
 * writing it the one way the app stores it, and reading every code out of
 * whatever a technician pastes from a scan tool.
 *
 * A code is a letter for the system (P powertrain, C chassis, B body,
 * U network), a digit 0 to 3 for who defined it, and three hex digits:
 * P0420, U0100, B1A2F. Stored upper case, with nothing around it.
 */

import { canonicalMakeKey, isMakeKey, makeName } from './makes'

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
 * A manufacturer's own code as its dealer tools show it: hex, without the
 * system letter of an OBD code (BMW's 2A82, CD87, 00A0B1). It means something
 * only on that make's cars, so it is read as one only where the make is known.
 */
export const OEM_CODE_PATTERN = /^[0-9A-F]{3,8}$/

/** Makes whose own codes come from one manufacturer's data: BMW's covers MINI and Rolls-Royce. */
const OEM_SOURCES: Record<string, string> = {
  bmw: 'bmw',
  mini: 'bmw',
  'rolls-royce': 'bmw',
  'rolls royce': 'bmw',
}

/** Makes whose own codes are hex, read from their control units' data. */
const HEX_MAKES = new Set(['bmw'])

/** The makes whose cars carry one make's codes, as people write them: BMW's are on MINIs too. */
export const OEM_SOURCE_MAKES: Record<string, string[]> = { bmw: ['BMW', 'MINI', 'Rolls-Royce'] }

/**
 * The makes a fix for this code can be for: BMW, MINI or Rolls-Royce for
 * BMW-2A82; null for an OBD code, which any make may have.
 */
export function fixMakesFor(fixCode: string): string[] | null {
  const split = splitFixCode(fixCode)
  return split ? (OEM_SOURCE_MAKES[split.make] ?? [makeName(split.make)]) : null
}

/** BMW-2A82 as bmw and 2A82, LAND-ROVER-P1000 as land-rover and P1000; null for an OBD code. */
export function splitFixCode(fixCode: string): { make: string; code: string } | null {
  const at = fixCode.lastIndexOf('-')
  if (at < 2) return null
  const make = fixCode.slice(0, at).toLowerCase()
  if (!isMakeKey(make)) return null
  const code = normalizeMakeCode(make, fixCode.slice(at + 1))
  return code ? { make, code } : null
}

/** The make whose codes a vehicle make carries: a MINI and a Rolls-Royce carry BMW's. */
const CODE_SOURCES: Record<string, string> = { mini: 'bmw', 'rolls-royce': 'bmw' }

/**
 * Whether a vehicle of `vehicleMake` carries `codeMake`'s own codes, by the make each names
 * rather than how it is written: an Opel, a "Vauxhall" and an "Opel / Vauxhall" all carry
 * opel's, a MINI carries BMW's.
 */
export function vehicleCarriesMake(
  codeMake: string,
  vehicleMake: string | null | undefined
): boolean {
  const key = canonicalMakeKey(vehicleMake)
  if (!key) return false
  return key === codeMake || CODE_SOURCES[key] === codeMake
}

/** A make's own code as shared fixes keep it, with its make: BMW-2A82. */
export function oemFixCode(make: string, code: string): string {
  return `${make.toUpperCase()}-${code}`
}

/** A shared fix's code: an OBD code (P0420) or a make's own (BMW-2A82), normalised; else null. */
export function normalizeFixCode(input: string | null | undefined): string | null {
  if (!input) return null
  const obd = normalizeFaultCode(input)
  if (obd) return obd
  const split = splitFixCode(input.trim())
  return split ? oemFixCode(split.make, split.code) : null
}

/**
 * A make's own code in one form, as the code service reads it: BMW's hex (0x2a82 as 2A82),
 * or a make's letter codes (Ford's p1000 as P1000), a failure-type byte after it left off.
 */
export function normalizeMakeCode(make: string, input: string | null | undefined): string | null {
  if (HEX_MAKES.has(make)) return normalizeOemCode(input)
  return normalizeAnyMakeCode(input)
}

/** Any make's code, for a search box that does not know the make yet. */
export function normalizeAnyMakeCode(input: string | null | undefined): string | null {
  if (!input) return null
  let code = input.replace(/\s+/g, '').toUpperCase()
  if (/^0X[0-9A-F]+$/.test(code)) code = code.slice(2)
  code = code.replace(/[-:.][0-9A-F]{2}$/, '')
  return /^[A-Z0-9]{3,12}$/.test(code) ? code : null
}

/** The manufacturer data a make's own codes are looked up in ("bmw"), or null. */
export function oemSourceFor(make: string | null | undefined): string | null {
  if (!make) return null
  return OEM_SOURCES[make.trim().toLowerCase()] ?? null
}

/** 2A82 from " 0x2a82 "; null for an OBD code or anything that is not hex. */
export function normalizeOemCode(input: string | null | undefined): string | null {
  if (!input) return null
  const code = input.trim().toUpperCase().replace(/\s+/g, '').replace(/^0X/, '')
  if (normalizeFaultCode(code)) return null
  return OEM_CODE_PATTERN.test(code) ? code : null
}

export function isOemCode(input: string | null | undefined): boolean {
  return normalizeOemCode(input) !== null
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
/** A manufacturer code in running text: four to six hex digits, a whole word, maybe 0x first. */
const OEM_IN_TEXT = /(?<![0-9A-Z])(?:0x)?([0-9A-F]{4,6})(?![0-9A-Z])/gi

/**
 * Every code in pasted or typed text, once each, in the order they appear:
 * "p0420, P0171 stored" is P0420 and P0171 (stored). A status word counts
 * for the code it follows, up to the next code or the end of the line, so a
 * list a scan tool exports line by line keeps its statuses.
 *
 * With `oem` (the car's make has its own code data), manufacturer codes
 * count too: "2A82, CD87". A number without a letter (4110) counts only when
 * the text is nothing but codes, so a year or a mileage in a sentence is not
 * taken for one.
 */
export function extractFaultCodes(text: string, options?: { oem?: boolean }): ExtractedCode[] {
  const out: ExtractedCode[] = []
  const seen = new Map<string, ExtractedCode>()
  const obd = [...text.matchAll(CODE_IN_TEXT)].map((m) => ({
    code: m[1].toUpperCase(),
    index: m.index ?? 0,
    length: m[0].length,
  }))
  const oem: typeof obd = []
  if (options?.oem) {
    const onlyCodes = text
      .split(/[\s,;|]+/)
      .filter(Boolean)
      .every(
        (word) =>
          isFaultCode(word) ||
          OEM_CODE_PATTERN.test(word.toUpperCase().replace(/^0X/, '')) ||
          STATUS_WORDS[word.toLowerCase()] !== undefined
      )
    for (const m of text.matchAll(OEM_IN_TEXT)) {
      const code = m[1].toUpperCase()
      if (isFaultCode(code)) continue
      // In running text a code mixes digits and letters (2A82, CD87): a year is all digits and
      // "dead" or "face" all letters. Written with 0x, or in a list of nothing but codes, it is one.
      const explicit = m[0].toLowerCase().startsWith('0x')
      if (!onlyCodes && !explicit && !(/[A-F]/.test(code) && /[0-9]/.test(code))) continue
      oem.push({ code, index: m.index ?? 0, length: m[0].length })
    }
  }
  const matches = [...obd, ...oem].sort((a, b) => a.index - b.index)
  matches.forEach((match, i) => {
    const code = match.code
    const start = match.index + match.length
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
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

/**
 * Whether a search could be a make's own code typed in full (BMW's 283700 or
 * 2A82): four to eight hex digits that are not an OBD code. Whether the make
 * has it is the service's to say.
 */
export function looksLikeOemCode(query: string): boolean {
  const code = normalizeOemCode(query)
  return code !== null && code.length >= 4
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
