/**
 * Tags on inventory parts: what is stored, how a search matches them, and how
 * they say a part fits the vehicle on the job.
 *
 * Pure and client-safe, so the form, the pickers and the server agree on the
 * same rules.
 */

import { MAKES, canonicalMakeKey } from '@/features/fault-codes/Lib/makes'

/** Longest tag a part can carry, in characters. */
export const MAX_TAG_LENGTH = 40

/** Most tags one part can carry. */
export const MAX_PART_TAGS = 30

/** A tag with its edges trimmed and runs of whitespace made one space. */
export function cleanTag(tag: string): string {
  return tag.replace(/\s+/g, ' ').trim()
}

/**
 * The tags as stored: cleaned, empty ones dropped, and a repeat that differs
 * only in case dropped too, so "Toyota" and "toyota" are one tag and the
 * spelling typed first wins.
 */
export function normalizePartTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const tag = cleanTag(raw)
    if (!tag) continue
    const key = tag.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/** Typed or pasted text split into tags at its commas. */
export function splitTagInput(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map(cleanTag)
    .filter(Boolean)
}

/** Whether two tags are the same tag, which ignores case. */
export function sameTag(a: string, b: string): boolean {
  return cleanTag(a).toLocaleLowerCase() === cleanTag(b).toLocaleLowerCase()
}

/**
 * Every distinct tag across the given lists, sorted for a menu. Where the
 * workshop has spelt one tag two ways, the spelling more parts use is shown.
 */
export function distinctTags(lists: readonly (readonly string[])[]): string[] {
  const byKey = new Map<string, Map<string, number>>()
  for (const list of lists) {
    for (const raw of list) {
      const tag = cleanTag(raw)
      if (!tag) continue
      const key = tag.toLocaleLowerCase()
      const spellings = byKey.get(key) ?? new Map<string, number>()
      spellings.set(tag, (spellings.get(tag) ?? 0) + 1)
      byKey.set(key, spellings)
    }
  }
  const tags = [...byKey.values()].map(
    (spellings) => [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0]
  )
  return tags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
}

/** The fields of a part a search looks through. */
export interface SearchablePart {
  name: string
  partNumber?: string | null
  barcode?: string | null
  category?: string | null
  description?: string | null
  tags?: readonly string[] | null
}

/**
 * Whether a part answers a typed search: every word of the query appears in
 * one of its fields or tags, in any order, so "filter hilux" finds a fuel
 * filter tagged "Hilux".
 */
export function partMatchesQuery(part: SearchablePart, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const fields = [
    part.name,
    part.partNumber,
    part.barcode,
    part.category,
    part.description,
    ...(part.tags ?? []),
  ]
    .filter((field): field is string => Boolean(field))
    .map((field) => field.toLocaleLowerCase())
  return words.every((word) => fields.some((field) => field.includes(word)))
}

/** The vehicle a part is being picked for. */
export interface FitVehicle {
  make?: string | null
  model?: string | null
}

/** Letters and digits only, lower case: "Hilux 2015-2020" is hilux, 2015, 2020. */
function wordsOf(text: string | null | undefined): string[] {
  return (text ?? '')
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Whether `phrase` appears in `words` as whole words, in order. */
function containsPhrase(words: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > words.length) return false
  for (let start = 0; start + phrase.length <= words.length; start++) {
    if (phrase.every((word, i) => words[start + i] === word)) return true
  }
  return false
}

const isYear = (word: string) => /^(19|20)\d{2}$/.test(word)
const hasLetter = (word: string) => /\p{L}/u.test(word)

/** Every way a known make is written, as words: its name, its key and its aliases. */
const MAKE_PHRASES: { key: string; words: string[] }[] = MAKES.flatMap((make) =>
  [make.name, make.key, ...(make.aliases ?? [])].map((text) => ({
    key: make.key,
    words: wordsOf(text),
  }))
)

/** Whether `words` begins with `phrase`. */
function startsWith(words: string[], phrase: string[]): boolean {
  return (
    phrase.length > 0 && phrase.length <= words.length && phrase.every((w, i) => words[i] === w)
  )
}

/**
 * Whether the tag opens with a make other than the vehicle's: "Toyota
 * Sprinter" on a Mercedes-Benz. Only the start is read, so "Hilux seat cover"
 * is not taken for a SEAT; the longest make wins, so "Volvo Penta" is not a
 * Volvo; and another way of writing the vehicle's own make ("Mercedes", "VW",
 * "Vauxhall" for an Opel) is the same make.
 */
function opensWithAnotherMake(tagWords: string[], vehicle: FitVehicle): boolean {
  const ownWords = wordsOf(vehicle.make)
  if (ownWords.length === 0) return false
  const own = canonicalMakeKey(vehicle.make)
  const opening = MAKE_PHRASES.filter(({ words }) => startsWith(tagWords, words)).sort(
    (a, b) => b.words.length - a.words.length
  )[0]
  if (!opening || opening.key === own) return false
  // A make the list does not know, written out in full ("Volvo Penta" when the
  // list only had "Volvo"), is still the vehicle's own.
  return !(startsWith(tagWords, ownWords) && ownWords.length >= opening.words.length)
}

/**
 * How a tag relates to the vehicle: `model` when it names the vehicle's
 * model ("Hilux", "Toyota Hilux", "Hilux 2015-2020"), `make` when it names
 * only the make, perhaps with years ("Toyota", "Toyota 2010"), else null.
 *
 * A tag naming the make and some other model ("Toyota Corolla" on a Hilux) is
 * no match: it says which Toyota the part fits, and it is not this one. Nor
 * is a tag opening with another make ("Toyota Sprinter" on a Mercedes-Benz
 * Sprinter), whatever model follows.
 */
export function tagFit(tag: string, vehicle: FitVehicle): 'model' | 'make' | null {
  const tagWords = wordsOf(tag)
  if (opensWithAnotherMake(tagWords, vehicle)) return null
  // Years narrow a tag ("Hilux 2015-2020") but do not name anything. Other
  // numbers do ("3-Serie" is not a "5-Serie"), though a tag needs a word with
  // letters in it: "50" alone, from "BT-50", is too weak to count.
  const named = tagWords.filter((word) => !isYear(word))
  if (!named.some(hasLetter)) return null
  const modelWords = wordsOf(vehicle.model)
  const makeWords = wordsOf(vehicle.make)
  const onlyMake = makeWords.length > 0 && named.every((word) => makeWords.includes(word))
  // What the tag says besides the make: "Hilux" of "Toyota Hilux".
  const beyondMake = named.filter((word) => !makeWords.includes(word))

  if (modelWords.length > 0) {
    if (containsPhrase(tagWords, modelWords)) return 'model'
    // A shorter name inside a longer model field: "Hilux" or "Toyota Hilux" on
    // a "Hilux SR5". Not when the tag is only the make and the model field
    // repeats it.
    if (!onlyMake && beyondMake.some(hasLetter) && containsPhrase(modelWords, beyondMake)) {
      return 'model'
    }
  }

  if (onlyMake && (containsPhrase(named, makeWords) || containsPhrase(makeWords, named))) {
    return 'make'
  }

  return null
}

/**
 * How strongly a part's tags say it fits the vehicle: 2 when a tag names the
 * model, 1 when one names only the make, 0 when none does.
 */
export function vehicleFitScore(
  tags: readonly string[] | null | undefined,
  vehicle: FitVehicle | null | undefined
): number {
  if (!vehicle || !tags?.length) return 0
  let score = 0
  for (const tag of tags) {
    const fit = tagFit(tag, vehicle)
    if (fit === 'model') return 2
    if (fit === 'make') score = 1
  }
  return score
}

/** The tags that say a part fits the vehicle, for showing which ones matched. */
export function fittingTags(
  tags: readonly string[] | null | undefined,
  vehicle: FitVehicle | null | undefined
): string[] {
  if (!vehicle || !tags?.length) return []
  return tags.filter((tag) => tagFit(tag, vehicle) !== null)
}

/**
 * The parts with those whose tags fit the vehicle first, model matches before
 * make matches; otherwise in the order given.
 */
export function rankByVehicleFit<T extends { tags?: readonly string[] | null }>(
  parts: readonly T[],
  vehicle: FitVehicle | null | undefined
): T[] {
  if (!vehicle) return [...parts]
  return parts
    .map((part, index) => ({ part, index, score: vehicleFitScore(part.tags, vehicle) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ part }) => part)
}
