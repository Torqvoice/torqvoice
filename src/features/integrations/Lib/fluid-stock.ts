import {
  lineTotal,
  type PricingSettings,
  resolvePartPrice,
} from '@/features/inventory/Lib/partPricing'
import type { FluidUnits } from './repair-prefs'
import type { FluidSpec } from './types'

/**
 * A fluid from the labor guide as a part line: matched against the
 * workshop's stock when it carries the same grade or spec, else a plain line
 * for the shop to price. Pure, and free of server imports, so the dialog and
 * the tests share it.
 *
 * Matching goes by grades and spec codes ("0W-20", "DOT 4", "VW 504.00",
 * "G13") rather than by words: they read the same in every language, so a
 * Norwegian shop's "Motorolje 0W-20 5L" meets Open Labor Project's
 * "0W-20 full synthetic" without any translation.
 */

/** A stocked item, as both the work order and the quote page hold them. */
export interface StockPart {
  id: string
  name: string
  partNumber: string | null
  description?: string | null
  category?: string | null
  unit?: string | null
  unitCost: number
  sellPrice: number
  /** In stock, in `unit`. */
  quantity: number
}

/** A part line the page adds as it would a pick from stock. */
export interface FluidPartLine {
  partNumber: string
  name: string
  quantity: number
  unit: string | null
  category: string | null
  unitCost: number
  markupPercent: number
  unitPrice: number
  total: number
  inventoryPartId: string | null
}

/**
 * Grades and spec codes, each with its kind. Two values of an exclusive
 * kind cannot both be right: an oil is 0W-20 or 5W-30, never both, so a
 * stocked item with another value of that kind is not offered at all.
 */
/**
 * VW's coolant family as one value per generation: G12, G12+, G12++ and
 * G12 evo are different coolants, and "plus" is written both ways.
 */
function coolantValue(raw: string): string {
  const m = /g\s*-?\s*(1[1-3])\s*(.*)$/.exec(raw)
  if (!m) return raw.replace(/[\s-]/g, '')
  const suffix = m[2].replace(/\s+/g, '').replace(/plus/g, '+')
  return `g${m[1]}${suffix}`
}

const PATTERNS: {
  kind: string
  exclusive: boolean
  pattern: RegExp
  /** How a match is written for comparing; spacing, dashes and plus signs dropped unless given. */
  value?: (raw: string) => string
}[] = [
  { kind: 'viscosity', exclusive: true, pattern: /\b\d{1,2}\s*w\s*-?\s*\d{2,3}\b/g },
  { kind: 'brake', exclusive: true, pattern: /\bdot\s*[345](?:\.1)?\b/g },
  {
    kind: 'coolant',
    exclusive: true,
    // The longest suffix, then nothing that could carry it on: "g12++" is
    // never read as g12 or g12+.
    pattern: /\bg\s*-?\s*1[1-3](?:\s*(?:\+\s*\+|\+|plus\s*plus|plus|evo))?(?=$|[^a-z0-9+])/g,
    value: coolantValue,
  },
  { kind: 'spec', exclusive: false, pattern: /\bdexos\s*-?\s*\d?\b/g },
  { kind: 'spec', exclusive: false, pattern: /\bdexron\s*-?\s*(?:vi|v|iii|ii)\b/g },
  { kind: 'spec', exclusive: false, pattern: /\bmercon\s*-?\s*(?:ulv|lv|sp|v)\b/g },
  { kind: 'spec', exclusive: false, pattern: /\batf\s*\+\s*4\b/g },
  {
    kind: 'spec',
    exclusive: false,
    pattern: /\b(?:vw|mb|bmw)\s*-?\s*(?:ll\s*-?\s*)?\d{2,3}(?:\.\d{1,2})?\b/g,
  },
  { kind: 'spec', exclusive: false, pattern: /\b\d{3}\.\d{1,2}\b/g },
  { kind: 'spec', exclusive: false, pattern: /\bapi\s*(?:s[a-z]|c[a-z](?:-\d)?|gl\s*-?\s*\d)\b/g },
  { kind: 'spec', exclusive: false, pattern: /\bilsac\s*gf\s*-?\s*\d[ab]?\b/g },
  { kind: 'spec', exclusive: false, pattern: /\bacea\s*[abce]\d\b/g },
  { kind: 'spec', exclusive: false, pattern: /\b(?:p\s*-?\s*hoat|si\s*-?\s*oat|hoat|oat|iat)\b/g },
  { kind: 'spec', exclusive: false, pattern: /\bcvt\b/g },
]

interface Token {
  kind: string
  exclusive: boolean
  value: string
}

/** The grades and spec codes in a piece of text, written one way: "0W-20" and "0w20" are both 0w20. */
export function fluidTokens(text: string | null | undefined): Token[] {
  if (!text) return []
  const plain = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const out = new Map<string, Token>()
  for (const { kind, exclusive, pattern, value: write } of PATTERNS) {
    for (const m of plain.matchAll(pattern)) {
      const value = write ? write(m[0]) : m[0].replace(/[\s\-+]/g, '')
      out.set(`${kind}:${value}`, { kind, exclusive, value })
    }
  }
  return [...out.values()]
}

export interface StockMatch {
  part: StockPart
  /** How many of the fluid's grades and specs the item carries. */
  score: number
}

/**
 * Stocked items that carry the fluid's grade or spec, best first: the most
 * codes in common, then in stock, then sold by volume. An item with a
 * different grade, brake fluid class or coolant type is left out.
 */
export function matchStock(
  fluid: Pick<FluidSpec, 'fluid' | 'spec'>,
  stock: readonly StockPart[],
  limit = 3
): StockMatch[] {
  const wanted = fluidTokens(`${fluid.fluid ?? ''} ${fluid.spec ?? ''}`)
  if (wanted.length === 0) return []
  const wantedKeys = new Set(wanted.map((t) => `${t.kind}:${t.value}`))
  const exclusiveKinds = new Set(wanted.filter((t) => t.exclusive).map((t) => t.kind))
  const matches: StockMatch[] = []
  for (const part of stock) {
    const own = fluidTokens(
      [part.name, part.partNumber, part.description, part.category].filter(Boolean).join(' ')
    )
    const clash = own.some(
      (t) => t.exclusive && exclusiveKinds.has(t.kind) && !wantedKeys.has(`${t.kind}:${t.value}`)
    )
    if (clash) continue
    const score = own.filter((t) => wantedKeys.has(`${t.kind}:${t.value}`)).length
    if (score > 0) matches.push({ part, score })
  }
  return matches
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.part.quantity > 0) - Number(a.part.quantity > 0) ||
        Number(volumeUnitOf(b.part.unit) !== null) - Number(volumeUnitOf(a.part.unit) !== null) ||
        a.part.name.localeCompare(b.part.name)
    )
    .slice(0, limit)
}

const LITRES_PER_QUART = 0.946353

/** "l", "Ltr", "liter", "qt", "ml": the volume a unit stands for, or null for "pcs" and the like. */
export function volumeUnitOf(unit: string | null | undefined): 'l' | 'ml' | 'qt' | null {
  const u = unit?.trim().toLowerCase().replace(/\.$/, '') ?? ''
  if (['l', 'lt', 'ltr', 'liter', 'litre', 'liters', 'litres', 'liter(s)'].includes(u)) return 'l'
  if (['ml', 'milliliter', 'millilitre'].includes(u)) return 'ml'
  if (['qt', 'quart', 'quarts', 'qts'].includes(u)) return 'qt'
  return null
}

/**
 * What a service puts in: the drain and refill amount when the source gives
 * one, which is what goes back in at a change, else the full capacity. Both
 * in litres, from whichever figure the source has.
 */
export function fluidLitres(
  fluid: Pick<
    FluidSpec,
    'drainRefillLiters' | 'drainRefillQuarts' | 'capacityLiters' | 'capacityQuarts'
  >
): { litres: number; from: 'drainRefill' | 'capacity' } | null {
  const drain = fluid.drainRefillLiters ?? toLitres(fluid.drainRefillQuarts)
  if (drain !== null) return { litres: drain, from: 'drainRefill' }
  const capacity = fluid.capacityLiters ?? toLitres(fluid.capacityQuarts)
  return capacity !== null ? { litres: capacity, from: 'capacity' } : null
}

function toLitres(quarts: number | null): number | null {
  return quarts === null ? null : quarts * LITRES_PER_QUART
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** The amount in the given unit, or null when the unit is not a volume. */
export function amountIn(litres: number, unit: string | null | undefined): number | null {
  const volume = volumeUnitOf(unit)
  if (volume === 'l') return round2(litres)
  if (volume === 'ml') return Math.round(litres * 1000)
  if (volume === 'qt') return round2(litres / LITRES_PER_QUART)
  return null
}

/** "Engine Oil, 0W-20 full synthetic (API SP)": what a plain line is called. */
export function fluidLineName(fluid: Pick<FluidSpec, 'system' | 'fluid' | 'spec'>): string {
  const what = [fluid.system, fluid.fluid].filter(Boolean).join(', ')
  return fluid.spec ? `${what} (${fluid.spec})` : what
}

/**
 * The part line for a fluid. From stock, it is that item at the page's own
 * price, in the item's unit when it is sold by volume and one of it when it
 * is not (a 5 L can). Without a stock item, it is a plain line with the
 * amount in litres, or quarts when the workshop reads fluids in US units,
 * and no price yet.
 */
export function fluidPartLine(
  fluid: Pick<
    FluidSpec,
    | 'system'
    | 'fluid'
    | 'spec'
    | 'drainRefillLiters'
    | 'drainRefillQuarts'
    | 'capacityLiters'
    | 'capacityQuarts'
  >,
  options: { units: FluidUnits; part?: StockPart; pricing?: PricingSettings }
): FluidPartLine {
  const needed = fluidLitres(fluid)
  const { part, pricing } = options
  if (part) {
    const quantity = (needed && amountIn(needed.litres, part.unit)) || 1
    const { unitPrice, markupPercent } = resolvePartPrice(part, pricing)
    return {
      partNumber: part.partNumber ?? '',
      name: part.name,
      quantity,
      unit: part.unit ?? null,
      category: part.category ?? null,
      unitCost: Number(part.unitCost) || 0,
      markupPercent,
      unitPrice,
      total: lineTotal(quantity, unitPrice),
      inventoryPartId: part.id,
    }
  }
  const unit = options.units === 'us' ? 'qt' : 'l'
  return {
    partNumber: '',
    name: fluidLineName(fluid),
    quantity: (needed && amountIn(needed.litres, unit)) || 1,
    unit: needed ? unit : null,
    category: null,
    unitCost: 0,
    markupPercent: 0,
    unitPrice: 0,
    total: 0,
    inventoryPartId: null,
  }
}
