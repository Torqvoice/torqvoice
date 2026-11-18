/**
 * The palette's matching engine. Pure string work on a few hundred prepared
 * items, so it runs on every keystroke with nothing to debounce.
 *
 * Ranking, best first, per query word:
 *   the title is the word, starts with it, has a word starting with it,
 *   contains it; then the same on an alias; then the breadcrumb and the
 *   description; and last a loose subsequence of the title ("lcl" for
 *   Localization), which only counts for three letters or more.
 * Every word of the query has to land somewhere. A result is `strong` when
 * each word hit a title or alias directly, which is how the palette decides
 * whether settings and pages go above the workshop's own records or below.
 *
 * Accents are folded both ways, so "Lokalisierung" is found by "lokalis"
 * and "Tax" by "tåx"; æ, ø, å and ß fold to the letters people type for them.
 */

export type Range = [start: number, end: number]

export type Searchable = {
  title: string
  /** English aliases and foreign words people type for this thing. */
  keywords?: readonly string[]
  /** One quiet line, matched last. */
  description?: string
  /** Where it lives, matched between aliases and the description ("Billing · Invoice"). */
  context?: string
}

type Folded = { text: string; map: number[] }

const FOLD_SPECIAL: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  å: 'a',
  ß: 'ss',
  œ: 'oe',
  đ: 'd',
  ł: 'l',
  þ: 'th',
  ð: 'd',
}

/** Lower case, accents stripped, with a map from each folded char back to its source index. */
function foldWithMap(source: string): Folded {
  let text = ''
  const map: number[] = []
  const lower = source.toLowerCase()
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i]
    const special = FOLD_SPECIAL[ch]
    const out = special ?? ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    for (const c of out) {
      text += c
      map.push(i)
    }
  }
  return { text, map }
}

/** Lower case and accent free, for comparing without needing ranges back. */
export function fold(source: string): string {
  return foldWithMap(source).text
}

export type PreparedItem = {
  title: Folded
  /** Start offsets of each word in the folded title. */
  wordStarts: number[]
  keywords: string[]
  context: string
  description: string
}

export function prepareItem(s: Searchable): PreparedItem {
  const title = foldWithMap(s.title)
  const wordStarts: number[] = []
  const re = /[a-z0-9]+/g
  let m: RegExpExecArray | null = re.exec(title.text)
  while (m) {
    wordStarts.push(m.index)
    m = re.exec(title.text)
  }
  return {
    title,
    wordStarts,
    keywords: (s.keywords ?? []).map(fold),
    context: fold(s.context ?? ''),
    description: fold(s.description ?? ''),
  }
}

export type PreparedQuery = {
  /** The whole query, folded and single-spaced. */
  text: string
  tokens: string[]
}

export function prepareQuery(query: string): PreparedQuery {
  const text = fold(query).replace(/\s+/g, ' ').trim()
  const tokens = Array.from(new Set(text.split(' ').filter(Boolean)))
  return { text, tokens }
}

export type Match = {
  score: number
  /** Character ranges in the original title to highlight. */
  ranges: Range[]
  /** Every word hit a title or an alias directly. */
  strong: boolean
}

/** A word starts here: index 0 or the previous character is not a letter or digit. */
function atWordStart(text: string, index: number): boolean {
  if (index === 0) return true
  return !/[a-z0-9]/.test(text[index - 1])
}

/** Best score for one token on one folded string, with how it matched. */
function scoreText(
  token: string,
  text: string,
  weights: { exact: number; prefix: number; wordStart: number; contains: number }
): { score: number; index: number } | null {
  if (!text) return null
  if (text === token) return { score: weights.exact, index: 0 }
  const coverage = Math.round((token.length / Math.max(text.length, 1)) * 40)
  if (text.startsWith(token)) return { score: weights.prefix + coverage, index: 0 }
  let index = text.indexOf(token)
  let firstIndex = -1
  while (index !== -1) {
    if (firstIndex === -1) firstIndex = index
    if (atWordStart(text, index)) return { score: weights.wordStart + coverage, index }
    index = text.indexOf(token, index + 1)
  }
  if (firstIndex !== -1) return { score: weights.contains, index: firstIndex }
  return null
}

const TITLE = { exact: 1000, prefix: 800, wordStart: 620, contains: 420 }
const KEYWORD = { exact: 560, prefix: 400, wordStart: 340, contains: 250 }
const CONTEXT = { exact: 230, prefix: 220, wordStart: 210, contains: 160 }
const DESCRIPTION = { exact: 200, prefix: 200, wordStart: 190, contains: 130 }

/** Direct hits on a title or alias; anything below is a loose match. */
const STRONG_FLOOR = 250

/**
 * Subsequence match: every character of the token appears in order. Scores
 * by how tightly the characters sit together and whether they open words,
 * so "lcl" likes "LoCaLization" and "wrk" likes "WoRKshop".
 */
function fuzzy(token: string, text: string): { score: number; positions: number[] } | null {
  if (token.length < 3) return null
  const positions: number[] = []
  let from = 0
  for (const ch of token) {
    const at = text.indexOf(ch, from)
    if (at === -1) return null
    positions.push(at)
    from = at + 1
  }
  const span = positions[positions.length - 1] - positions[0] + 1
  const tightness = token.length / span
  const wordStarts = positions.filter((p) => atWordStart(text, p)).length
  const score = Math.round(40 + 140 * tightness + 25 * wordStarts)
  return { score: Math.min(score, 280), positions }
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}

function toSourceRange(folded: Folded, start: number, end: number): Range {
  return [folded.map[start], folded.map[end - 1] + 1]
}

export function matchItem(query: PreparedQuery, item: PreparedItem): Match | null {
  if (query.tokens.length === 0) return { score: 0, ranges: [], strong: true }
  let total = 0
  let strong = true
  const ranges: Range[] = []
  const title = item.title.text

  for (const token of query.tokens) {
    let best = 0
    let bestRange: Range | null = null
    let fuzzyPositions: number[] | null = null

    const onTitle = scoreText(token, title, TITLE)
    if (onTitle) {
      best = onTitle.score
      bestRange = toSourceRange(item.title, onTitle.index, onTitle.index + token.length)
    }
    for (const keyword of item.keywords) {
      const hit = scoreText(token, keyword, KEYWORD)
      if (hit && hit.score > best) {
        best = hit.score
        bestRange = null
      }
    }
    const onContext = scoreText(token, item.context, CONTEXT)
    if (onContext && onContext.score > best) {
      best = onContext.score
      bestRange = null
    }
    const onDescription = scoreText(token, item.description, DESCRIPTION)
    if (onDescription && onDescription.score > best) {
      best = onDescription.score
      bestRange = null
    }
    if (best === 0) {
      const loose = fuzzy(token, title)
      if (!loose) return null
      best = loose.score
      fuzzyPositions = loose.positions
    }

    if (best < STRONG_FLOOR) strong = false
    total += best
    if (bestRange) ranges.push(bestRange)
    if (fuzzyPositions) {
      for (const p of fuzzyPositions) ranges.push(toSourceRange(item.title, p, p + 1))
    }
  }

  // The words as typed, in that order, are worth more than the words apart:
  // "due days" should beat a title that merely has both somewhere.
  if (query.tokens.length > 1 && query.text.length > 0) {
    if (title === query.text) total += 500
    else if (title.startsWith(query.text)) total += 400
    else if (title.includes(query.text)) total += 250
  }

  return { score: total, ranges: mergeRanges(ranges), strong }
}

export type Ranked<T> = { item: T; match: Match }

/**
 * Ranks `items` for `query`, best first; items that do not match are left
 * out. Ties go to the shorter title, then to the earlier item, so the list
 * is stable while someone types.
 */
export function rank<T>(
  query: PreparedQuery,
  items: readonly { item: T; prepared: PreparedItem }[],
  limit = Number.POSITIVE_INFINITY
): Ranked<T>[] {
  const out: (Ranked<T> & { order: number; length: number })[] = []
  items.forEach(({ item, prepared }, order) => {
    const match = matchItem(query, prepared)
    if (match) out.push({ item, match, order, length: prepared.title.text.length })
  })
  out.sort((a, b) => b.match.score - a.match.score || a.length - b.length || a.order - b.order)
  return out.slice(0, limit).map(({ item, match }) => ({ item, match }))
}

/**
 * Splits a title into plain and highlighted pieces by its match ranges, for
 * rendering without a dangerouslySetInnerHTML.
 */
export function splitByRanges(text: string, ranges: Range[]): { text: string; hit: boolean }[] {
  if (ranges.length === 0) return [{ text, hit: false }]
  const parts: { text: string; hit: boolean }[] = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false })
    parts.push({ text: text.slice(start, end), hit: true })
    cursor = end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false })
  return parts
}
