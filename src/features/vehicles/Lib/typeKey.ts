/**
 * The German type approval key (KBA-Schlüsselnummer) from the registration
 * certificate, Zulassungsbescheinigung Teil I:
 *
 *   HSN, field 2.1: the manufacturer, four digits ("0603" is Volkswagen).
 *   TSN, field 2.2: the type, three letters or digits ("BFQ"). The field
 *   prints more than that, a variant and version code with a check digit
 *   after it, but the TSN is only the first three characters. Parts
 *   catalogues and insurers ask for those three.
 *
 * Both are kept as text: the HSN has leading zeros, and the TSN has letters.
 */

export const HSN_PATTERN = /^\d{4}$/
export const TSN_PATTERN = /^[A-Z0-9]{3}$/

function compact(value: string): string {
  return value.replace(/[\s./-]/g, '').toUpperCase()
}

/** "06 03" and " 0603" are the same HSN. Anything else is returned compacted, for validation to refuse. */
export function normalizeHsn(value: string): string {
  return compact(value)
}

/**
 * The whole of field 2.2 copied in ("BFQ00046") is cut to the type code,
 * since the rest is the variant and version, not the TSN.
 */
export function normalizeTsn(value: string): string {
  const compacted = compact(value)
  return compacted.length > 3 && /^[A-Z0-9]+$/.test(compacted) ? compacted.slice(0, 3) : compacted
}

/**
 * The pair the way it is quoted on the phone and on paper, "0603 / BFQ".
 * One half alone is still printed, since it is still what the papers say.
 */
export function formatTypeKey(
  hsn: string | null | undefined,
  tsn: string | null | undefined
): string {
  return [hsn, tsn].filter(Boolean).join(' / ')
}

/**
 * The printed line for a document's vehicle panel, or '' when the vehicle
 * has no type key, so the field drops out rather than printing a caption.
 */
export function typeKeyLine(
  vehicle: { hsn?: string | null; tsn?: string | null } | null | undefined,
  label: string | undefined
): string {
  const typeKey = formatTypeKey(vehicle?.hsn, vehicle?.tsn)
  if (!typeKey) return ''
  return (label || 'HSN/TSN: {typeKey}').replace('{typeKey}', typeKey)
}

/**
 * What one search word means as a type key: "0603" an HSN, "BFQ" a TSN, and
 * "0603/BFQ" or "0603BFQ" the pair, the way it is read off the papers or
 * pasted from an insurer. Empty for a word that cannot be part of one.
 */
export function typeKeySearchTerms(word: string): { hsn?: string; tsn?: string }[] {
  const compacted = word.replace(/[\s./-]/g, '').toUpperCase()
  const pair = compacted.match(/^(\d{4})([A-Z0-9]{3})$/)
  if (pair) return [{ hsn: pair[1], tsn: pair[2] }]
  const terms: { hsn?: string; tsn?: string }[] = []
  if (HSN_PATTERN.test(compacted)) terms.push({ hsn: compacted })
  if (TSN_PATTERN.test(compacted)) terms.push({ tsn: compacted })
  return terms
}

/**
 * A search box's words, without the lone separators of "0603 / BFQ", the
 * way the key is shown and copied. Each word must match something, and a
 * bare "/" matches nothing, so pasting the key back would find no car.
 */
export function searchWordsOf(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean)
  const meaningful = words.filter((word) => !/^[/.\-·]+$/.test(word))
  return meaningful.length > 0 ? meaningful : words
}
