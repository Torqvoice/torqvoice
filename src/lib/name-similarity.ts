/**
 * Fuzzy name matching, used to line a name read off a scanned document up
 * against the customers a workshop already has.
 *
 * Papers write names in their own way: "Lücking, Manuel" for a customer saved
 * as "Manuel Lücking", an OCR pass that turns "ü" into "u", a middle initial
 * that never made it into the app. Sorting the words and measuring edit
 * distance absorbs all three without matching two genuinely different people.
 */

/** Lowercases, strips punctuation and accents, and sorts the words. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ')
}

/**
 * Letters a name search treats as plain ones, as two strings of equal length
 * for SQL `translate()`: each accented Latin letter and each capital beside
 * the letter it becomes, plus the few that carry a stroke rather than an
 * accent (Ł, Ø, Đ...), which papers and OCR write plain just as often.
 *
 * `foldName` applies the same table in the browser or on the server, so a
 * word folded here is found in a column folded in the database: "Muller"
 * finds "Müller", and "Lukasz" finds "Łukasz", with no extension installed.
 */
export const NAME_FOLD: { from: string; to: string } = (() => {
  let from = ''
  let to = ''
  const strokes: Record<string, string> = { ł: 'l', ø: 'o', đ: 'd', ħ: 'h', ı: 'i', ŧ: 't' }
  for (let code = 0xc0; code <= 0x24f; code++) {
    const letter = String.fromCharCode(code)
    const plain = letter
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    const folded = strokes[plain] ?? plain
    if (folded !== letter && folded.length === 1) {
      from += letter
      to += folded
    }
  }
  return { from, to }
})()

/** Lowercases and folds letters with `NAME_FOLD`, as the database search does. */
export function foldName(value: string): string {
  return [...value]
    .map((letter) => {
      const at = NAME_FOLD.from.indexOf(letter)
      return at === -1 ? letter : NAME_FOLD.to[at]
    })
    .join('')
    .toLowerCase()
}

/** Levenshtein distance, iterative with a single row of state. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    previous = current
  }

  return previous[b.length]
}

/**
 * A name that is another name plus extra words scores just under an exact
 * match: "Autohaus Meyer" and "Autohaus Meyer GmbH" are almost always the same
 * customer, but the papers are not proof of it.
 */
const SUBSET_SCORE = 0.95

/**
 * Similarity of two names from 0 (nothing in common) to 1 (the same name once
 * spelling and word order are set aside).
 */
export function nameSimilarity(a: string, b: string): number {
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (!left || !right) return 0
  if (left === right) return 1

  const ratio = 1 - editDistance(left, right) / Math.max(left.length, right.length)

  // Edit distance alone punishes a legal form or a middle name harshly enough
  // to hide a real customer, so check whether one name simply contains the
  // other. Two words minimum: a lone surname matches far too much.
  const leftWords = left.split(' ')
  const rightWords = right.split(' ')
  const [shorter, longer] =
    leftWords.length <= rightWords.length ? [leftWords, rightWords] : [rightWords, leftWords]
  const contained = shorter.length >= 2 && shorter.every((word) => longer.includes(word))

  return contained ? Math.max(ratio, SUBSET_SCORE) : ratio
}
