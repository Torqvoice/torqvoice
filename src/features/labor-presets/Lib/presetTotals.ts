/**
 * Hours and units a labor preset adds to a job. A line priced per hour counts
 * as hours, a line priced as a service counts as units. Each total is rounded
 * to two decimals: 0.75 + 0.5 is 1.25 hours, which used to show as "1.3h",
 * and a sum of floats such as 0.1 + 0.2 must not print its float noise.
 */
export function presetTotals(items: { hours: number; pricingType?: string | null }[]) {
  let hours = 0
  let units = 0
  for (const item of items) {
    if (item.pricingType === 'service') units += item.hours
    else hours += item.hours
  }
  return { totalHours: round2(hours), totalUnits: round2(units) }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
