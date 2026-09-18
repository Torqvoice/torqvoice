export type WarrantyStatus = 'active' | 'expiring' | 'expired' | 'none'

export function getWarrantyStatus(
  warrantyExpiresAt: Date | string | null | undefined,
  warrantyMileage: number | null | undefined,
  serviceMileage: number | null | undefined,
  currentVehicleMileage: number | null | undefined
): WarrantyStatus {
  if (!warrantyExpiresAt) return 'none'

  const now = new Date()
  const expires = new Date(warrantyExpiresAt)
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Check if date-expired
  if (expires < now) return 'expired'

  // Check if mileage-expired
  if (warrantyMileage && serviceMileage != null && currentVehicleMileage != null) {
    if (currentVehicleMileage > serviceMileage + warrantyMileage) return 'expired'
  }

  // Check if expiring soon (within 30 days)
  if (expires < thirtyDaysFromNow) return 'expiring'

  return 'active'
}

/**
 * What a document tells the customer about the workshop's own warranty.
 *
 * Three answers, because saying nothing and saying "none" are different things
 * to the person reading a quote: `included`, `not_included`, or null when the
 * document does not mention it. This is the workshop's commercial warranty
 * only. Whatever the law gives a customer is theirs regardless, which is why
 * a document that says "not included" also says their statutory rights stand.
 */
export const WARRANTY_STATEMENTS = ['included', 'not_included'] as const
export type WarrantyStatement = (typeof WARRANTY_STATEMENTS)[number]

/** How an editor or a setting spells "says nothing", since a select needs a value. */
export const WARRANTY_NONE = 'none'
export type WarrantyChoice = WarrantyStatement | typeof WARRANTY_NONE

export interface WarrantyFields {
  warrantyStatus: WarrantyStatement | null
  warrantyMonths: number | null
  warrantyMileage: number | null
  warrantyNotes: string | null
}

export const EMPTY_WARRANTY: WarrantyFields = {
  warrantyStatus: null,
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyNotes: null,
}

export function isWarrantyStatement(value: unknown): value is WarrantyStatement {
  return value === 'included' || value === 'not_included'
}

function positiveInt(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const whole = Math.trunc(value)
  return whole > 0 ? whole : null
}

function filledText(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

/**
 * The four columns as they are stored, whatever combination a caller sent.
 *
 * Every write path goes through here so a row can never contradict itself:
 * "not included" with twelve months beside it, or months with no statement
 * above them. A caller that fills a field without choosing a statement is
 * offering a warranty, which is what a filled field meant before the
 * statement existed.
 */
export function normalizeWarranty(input: {
  warrantyStatus?: string | null
  warrantyMonths?: number | null
  warrantyMileage?: number | null
  warrantyNotes?: string | null
}): WarrantyFields {
  const months = positiveInt(input.warrantyMonths)
  const mileage = positiveInt(input.warrantyMileage)
  const notes = filledText(input.warrantyNotes)

  if (input.warrantyStatus === 'not_included') {
    return {
      warrantyStatus: 'not_included',
      warrantyMonths: null,
      warrantyMileage: null,
      warrantyNotes: notes,
    }
  }
  if (input.warrantyStatus === 'included') {
    return {
      warrantyStatus: 'included',
      warrantyMonths: months,
      warrantyMileage: mileage,
      warrantyNotes: notes,
    }
  }
  // An explicit "none" clears the lot, terms included: a document that says
  // nothing about warranty must not print terms for one.
  if (input.warrantyStatus === WARRANTY_NONE) return EMPTY_WARRANTY

  if (months || mileage || notes) {
    return {
      warrantyStatus: 'included',
      warrantyMonths: months,
      warrantyMileage: mileage,
      warrantyNotes: notes,
    }
  }
  return EMPTY_WARRANTY
}

/**
 * The warranty in a row of unknown shape, such as one read out of a backup
 * file. Anything that is not the type it should be is dropped.
 */
export function warrantyFromUntyped(row: Record<string, unknown>): WarrantyFields {
  return normalizeWarranty({
    warrantyStatus: typeof row.warrantyStatus === 'string' ? row.warrantyStatus : null,
    warrantyMonths: typeof row.warrantyMonths === 'number' ? row.warrantyMonths : null,
    warrantyMileage: typeof row.warrantyMileage === 'number' ? row.warrantyMileage : null,
    warrantyNotes: typeof row.warrantyNotes === 'string' ? row.warrantyNotes : null,
  })
}

/** The texts a workshop has written once, for the editor to fill in. */
export interface WarrantyTexts {
  /** Terms printed under an included warranty. */
  includedTerms: string
  /** What is printed when the workshop offers none. */
  notIncludedText: string
  defaultMonths: number | null
  defaultMileage: number | null
}

/**
 * The editor's fields after somebody picks another statement.
 *
 * The terms follow the statement only while they are still the workshop's
 * stock text (or empty). Words somebody typed for this customer stay, because
 * replacing them silently is how a promise gets lost. Months and mileage come
 * from the defaults only when both are empty, for the same reason.
 */
export function switchWarrantyStatement(
  current: WarrantyFields,
  next: WarrantyStatement | null,
  texts: WarrantyTexts
): WarrantyFields {
  if (next === null) return EMPTY_WARRANTY

  const notes = current.warrantyNotes?.trim() ?? ''
  const stock = [texts.includedTerms.trim(), texts.notIncludedText.trim()]
  const notesAreStock = notes === '' || stock.includes(notes)

  if (next === 'not_included') {
    return {
      warrantyStatus: 'not_included',
      warrantyMonths: null,
      warrantyMileage: null,
      warrantyNotes: notesAreStock ? filledText(texts.notIncludedText) : notes,
    }
  }

  const untouched = current.warrantyMonths == null && current.warrantyMileage == null
  return {
    warrantyStatus: 'included',
    warrantyMonths: untouched ? texts.defaultMonths : current.warrantyMonths,
    warrantyMileage: untouched ? texts.defaultMileage : current.warrantyMileage,
    warrantyNotes: notesAreStock ? filledText(texts.includedTerms) : notes,
  }
}
