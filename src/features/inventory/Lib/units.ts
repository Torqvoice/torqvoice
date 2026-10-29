/**
 * Units of measure offered when stocking a part.
 *
 * The unit itself is free text — a workshop can type anything — these lists
 * only feed the suggestion dropdowns. Count units ("pcs", "Stk", "vnt.") are
 * language-specific and live in the locale files; measurement units are
 * system-specific and live here, ordered by the workshop's configured unit
 * system so a metric shop sees litres first and an imperial shop quarts, with
 * the other system still one scroll away (a German shop can stock a US-spec
 * quart bottle).
 */

/**
 * The system fluids and parts are measured in. Its own setting since
 * distance and volume were split, so a British workshop can drive in miles
 * and pour in litres; a workshop that never chose follows its distance
 * setting, as before the split. Unset everywhere is imperial, the app's
 * long-standing default.
 */
export function measureSystemIn(
  settings: Record<string, string | undefined>
): 'metric' | 'imperial' {
  const own = settings['workshop.measureSystem']
  if (own === 'metric' || own === 'imperial') return own
  return settings['workshop.unitSystem'] === 'metric' ? 'metric' : 'imperial'
}

export const METRIC_MEASUREMENT_UNITS = ['l', 'ml', 'kg', 'g', 'm', 'cm'] as const

export const IMPERIAL_MEASUREMENT_UNITS = ['qt', 'gal', 'fl oz', 'lb', 'oz', 'ft', 'in'] as const

/**
 * Full suggestion list for the unit field.
 *
 * @param localizedCountUnits comma-separated count units from the locale
 *   (`inventory.form.unitSuggestions`, e.g. "Stk,Satz")
 * @param unitSystem the workshop's measure system (see measureSystemIn);
 *   anything other than "imperial" is treated as metric
 */
export function unitSuggestions(localizedCountUnits: string, unitSystem?: string): string[] {
  const countUnits = localizedCountUnits
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  const [primary, secondary] =
    unitSystem === 'imperial'
      ? [IMPERIAL_MEASUREMENT_UNITS, METRIC_MEASUREMENT_UNITS]
      : [METRIC_MEASUREMENT_UNITS, IMPERIAL_MEASUREMENT_UNITS]
  return [...new Set([...countUnits, ...primary, ...secondary])]
}
