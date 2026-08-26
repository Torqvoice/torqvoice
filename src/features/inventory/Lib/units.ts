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

export const METRIC_MEASUREMENT_UNITS = ['l', 'ml', 'kg', 'g', 'm', 'cm'] as const

export const IMPERIAL_MEASUREMENT_UNITS = ['qt', 'gal', 'fl oz', 'lb', 'oz', 'ft', 'in'] as const

/**
 * Full suggestion list for the unit field.
 *
 * @param localizedCountUnits comma-separated count units from the locale
 *   (`inventory.form.unitSuggestions`, e.g. "Stk,Satz")
 * @param unitSystem the workshop's `workshop.unitSystem` setting;
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
