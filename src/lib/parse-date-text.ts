/**
 * A date typed by hand, read the way the workshop writes dates. Shared by the
 * date field and the other fields that take a typed date, so every one of
 * them reads "03/04/2019" the same way.
 */

/** A local date as its day key, "2026-05-25". */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Sane bounds for any date a workshop would ever type. Everything outside is
// rejected on every parse path, so garbage can never reach the form value.
const MIN_YEAR = 1900
const MAX_YEAR = 2100

/** Build a date from parts; undefined on overflow (32.13.…) or absurd years */
function buildDate(year: number, month: number, day: number): Date | undefined {
  if (year < MIN_YEAR || year > MAX_YEAR) return undefined
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
    ? d
    : undefined
}

/**
 * Parse typed text into a Date. Supports separated numerics (25.05.2026,
 * 25/05/2026, 2026-05-25) with dot/slash/dash/space, compact digits
 * (25052026, 250526) and longhand text ("February 01, 2001"). Day-vs-month
 * order follows the workshop date format when ambiguous; a value over 12 is
 * always the day. Years outside 1900-2100 never parse.
 */
export function parseDateText(raw: string, dateFormat: string): Date | undefined {
  const text = raw.trim()
  if (!text) return undefined

  const monthFirst = dateFormat.trimStart().startsWith('M')
  const yearFirst = /^y/i.test(dateFormat.trimStart())

  const m = text.match(/^(\d{1,4})[./\-\s](\d{1,2})[./\-\s](\d{1,4})$/)
  if (m) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (m[1].length === 4) return buildDate(a, b, c) // 2026-05-25
    const year = c < 100 ? 2000 + c : c
    if (a > 12 && b <= 12) return buildDate(year, b, a)
    if (b > 12 && a <= 12) return buildDate(year, a, b)
    return monthFirst ? buildDate(year, a, b) : buildDate(year, b, a)
  }

  // Compact digits: 25052026 / 05252026 / 20260525 per format, 250526 short
  if (/^\d{8}$/.test(text)) {
    if (yearFirst) return buildDate(+text.slice(0, 4), +text.slice(4, 6), +text.slice(6, 8))
    const p1 = +text.slice(0, 2)
    const p2 = +text.slice(2, 4)
    const year = +text.slice(4, 8)
    const first = monthFirst ? buildDate(year, p1, p2) : buildDate(year, p2, p1)
    return (
      first ??
      (monthFirst ? buildDate(year, p2, p1) : buildDate(year, p1, p2)) ??
      buildDate(+text.slice(0, 4), +text.slice(4, 6), +text.slice(6, 8))
    )
  }
  if (/^\d{6}$/.test(text)) {
    const p1 = +text.slice(0, 2)
    const p2 = +text.slice(2, 4)
    const year = 2000 + +text.slice(4, 6)
    return monthFirst ? buildDate(year, p1, p2) : buildDate(year, p2, p1)
  }
  // Any other bare digit run is ambiguous mid-typing input: never guess
  if (/^[\d./\-\s]*$/.test(text)) return undefined

  // Longhand text ("February 01, 2001"), same year bounds
  const d = new Date(text)
  if (isNaN(d.getTime())) return undefined
  return d.getFullYear() >= MIN_YEAR && d.getFullYear() <= MAX_YEAR ? d : undefined
}
