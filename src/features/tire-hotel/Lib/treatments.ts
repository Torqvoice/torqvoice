/**
 * Prep work a stored set needs.
 *
 * Deliberately short. The tire department reads this list off a screen while
 * holding a wheel, so it covers the jobs almost every shop actually does and
 * leaves anything rarer to the set's notes. A longer list would be more
 * complete and less usable.
 */

export const TREATMENT_TYPES = [
  'wash_tires',
  'wash_rims',
  'balance',
  'tpms_service',
  'new_valves',
  'repair',
] as const
export type TreatmentType = (typeof TREATMENT_TYPES)[number]

export const TREATMENT_STATUSES = ['pending', 'done', 'skipped'] as const
export type TreatmentStatus = (typeof TREATMENT_STATUSES)[number]

/**
 * Lucide icon name per treatment, resolved by the component that renders it.
 * Kept as names rather than imported components so this module stays free of
 * React and can be used server-side.
 */
export const TREATMENT_ICONS: Record<TreatmentType, string> = {
  wash_tires: 'Droplets',
  wash_rims: 'Sparkles',
  balance: 'Scale',
  tpms_service: 'Gauge',
  new_valves: 'Wrench',
  repair: 'Hammer',
}

/**
 * Only treatments that apply are offered. Asking whether to wash the rims on
 * a set with no rims is noise, and noise is what makes a checklist stop being
 * read.
 */
export function applicableTreatments(set: {
  withRims: boolean
  hasTpms: boolean
}): TreatmentType[] {
  return TREATMENT_TYPES.filter((type) => {
    if (type === 'wash_rims') return set.withRims
    if (type === 'tpms_service') return set.hasTpms
    return true
  })
}

/**
 * What a shop most often wants doing when tires arrive for the season.
 * Prefilled at check-in and freely changed there.
 */
export function defaultTreatments(set: { withRims: boolean }): TreatmentType[] {
  return set.withRims ? ['wash_tires', 'wash_rims'] : ['wash_tires']
}

export type TreatmentLike = { type: string; status: string }

/** Outstanding work, in the order the list declares it. */
export function pendingTreatments<T extends TreatmentLike>(treatments: T[]): T[] {
  const order = new Map(TREATMENT_TYPES.map((type, index) => [type, index]))
  return treatments
    .filter((t) => t.status === 'pending')
    .sort(
      (a, b) =>
        (order.get(a.type as TreatmentType) ?? 99) - (order.get(b.type as TreatmentType) ?? 99)
    )
}

export function treatmentProgress(treatments: TreatmentLike[]): {
  total: number
  done: number
  pending: number
  /** Nothing outstanding, and there was something to do in the first place. */
  complete: boolean
} {
  // Skipped work counts as settled: someone looked at it and decided against
  // it, which is not the same as it still being on the list.
  const total = treatments.length
  const pending = treatments.filter((t) => t.status === 'pending').length
  const done = treatments.filter((t) => t.status === 'done').length
  return { total, done, pending, complete: total > 0 && pending === 0 }
}

export const TREATMENT_STATUS_TOKENS: Record<TreatmentStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  done: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  skipped: 'bg-muted text-muted-foreground border-border',
}
