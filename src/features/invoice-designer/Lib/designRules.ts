/**
 * Which design an invoice prints with when nobody chose one for it.
 *
 * The app makes two kinds of job: one from a vehicle, and a parts-only sale
 * from the sales page, with no vehicle at all. A workshop often wants the
 * second kind on a different sheet: no vehicle block, a shorter table, maybe
 * another title. Choosing the design by hand on each sale is the kind of
 * step that gets forgotten, so a design can volunteer itself for one of the
 * two kinds. The rule is read from the invoice at print time and never
 * stored on it, so attaching a vehicle to a sale moves it to the other
 * design by itself.
 *
 * The names follow the picker the workshop sees when it creates a job,
 * which offers a vehicle or a "Parts-Only Sale". Everything here is pure;
 * the lookup that turns a matched rule into a design row lives beside the
 * print assembly.
 */

export const DESIGN_AUTO_RULES = ['parts_sale', 'vehicle_job'] as const

export type DesignAutoRule = (typeof DESIGN_AUTO_RULES)[number]

/** The one fact about an invoice the rules look at. */
export interface DesignRuleSubject {
  hasVehicle: boolean
}

export function isDesignAutoRule(value: unknown): value is DesignAutoRule {
  return typeof value === 'string' && (DESIGN_AUTO_RULES as readonly string[]).includes(value)
}

export function designRuleMatches(rule: DesignAutoRule, subject: DesignRuleSubject): boolean {
  switch (rule) {
    case 'parts_sale':
      return !subject.hasVehicle
    case 'vehicle_job':
      return subject.hasVehicle
  }
}

/**
 * Of the designs that carry a rule, the one this invoice should print with,
 * or null when none applies. Takes the rows already loaded so the caller
 * decides how they are fetched and this stays testable without a database.
 */
export function pickDesignByRule<T extends { autoRule: string | null }>(
  designs: T[],
  subject: DesignRuleSubject
): T | null {
  for (const rule of DESIGN_AUTO_RULES) {
    if (!designRuleMatches(rule, subject)) continue
    const design = designs.find((d) => d.autoRule === rule)
    if (design) return design
  }
  return null
}
