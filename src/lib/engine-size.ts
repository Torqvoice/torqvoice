/**
 * Engine size, as the vehicle form writes it.
 *
 * The field is free text: people type "2.0", "1598 cc", "2.0 TDI" or an
 * engine family, and all of it is kept as typed. What a workshop chooses is
 * the unit a plate lookup writes in, because registries answer with the
 * exact displacement in cubic centimetres and the app used to round it to a
 * tenth of a litre, so a 649 cc motorcycle arrived as "0.6 L".
 */
export type EngineSizeUnit = 'litres' | 'cc'

export function engineSizeUnitOf(value: string | null | undefined): EngineSizeUnit {
  return value === 'cc' ? 'cc' : 'litres'
}

/**
 * Exact displacement in the workshop's unit. Litres keep a tenth for cars, as
 * the badge does, and every cubic centimetre below a litre, so a 49 cc moped
 * is 0.049 L and never rounds to zero.
 */
export function formatEngineSize(cc: number | undefined, unit: EngineSizeUnit): string | undefined {
  if (cc === undefined || !Number.isFinite(cc) || cc < 30) return undefined
  if (unit === 'cc') return `${Math.round(cc)} cc`
  const litres = cc < 1000 ? Number((cc / 1000).toFixed(3)) : (cc / 1000).toFixed(1)
  return `${litres} L`
}

/**
 * The unit a bare number in the field stands for, or null when the field
 * holds anything else. Engines are under thirty litres and over thirty cubic
 * centimetres, so the size of the number says which one was meant.
 */
export function bareEngineUnit(value: string): 'L' | 'cc' | null {
  const v = value.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(v)) return null
  const n = Number(v)
  if (!(n > 0)) return null
  return n < 30 ? 'L' : 'cc'
}

/** A bare number with its unit added; anything else exactly as typed. */
export function withEngineUnit(value: string): string {
  const unit = bareEngineUnit(value)
  return unit ? `${value.trim().replace(',', '.')} ${unit}` : value
}

/**
 * What the form saves for the field: a value typed or changed here gets its
 * unit; one saved before is kept exactly as it was, so editing the mileage
 * never rewrites an old "649" as "649 cc".
 */
export function engineSizeToSave(value: string, saved: string | null | undefined): string {
  return value.trim() === (saved ?? '').trim() ? value : withEngineUnit(value)
}

/** The unit the field shows beside an edited bare number, matching what will be saved. */
export function engineSizeHint(draft: string, saved: string | null | undefined): 'L' | 'cc' | null {
  return draft.trim() === (saved ?? '').trim() ? null : bareEngineUnit(draft)
}

/** What the empty field shows, in the workshop's unit. */
export function engineSizePlaceholder(unit: EngineSizeUnit): string {
  return unit === 'cc' ? '1598 cc' : '1.6 L'
}
