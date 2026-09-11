/**
 * What a new work order is called before anybody types a title.
 *
 * A workshop writes a template once, in Settings → Workshop, out of tags
 * such as `{order_number}` and `{license_plate}`; every job created after
 * that opens with the tags filled in from the job itself. The title is an
 * ordinary field afterwards and can be changed like any other.
 *
 * Resolution is forgiving on purpose. A tag nothing is known for (a vehicle
 * with no plate) disappears together with the separator that stood beside
 * it, an unknown tag is dropped, and a template that comes out empty falls
 * back to the plain name jobs always had, so a typo in the settings never
 * produces a job called "- -" or nothing at all.
 */

export const WORK_ORDER_TITLE_TOKENS = [
  'order_number',
  'license_plate',
  'customer_name',
  'vehicle',
  'make',
  'model',
  'year',
  'vin',
  'technician',
  'date',
] as const

export type WorkOrderTitleToken = (typeof WORK_ORDER_TITLE_TOKENS)[number]

/** Other spellings people reach for, read as the token they mean. */
const TOKEN_ALIASES: Record<string, WorkOrderTitleToken> = {
  order_id: 'order_number',
  invoice_number: 'order_number',
  job_number: 'order_number',
  plate: 'license_plate',
  registration: 'license_plate',
  customer: 'customer_name',
  client_name: 'customer_name',
  client: 'customer_name',
  tech: 'technician',
}

/** What every job starts with when the workshop has not said otherwise. */
export const DEFAULT_WORK_ORDER_TITLE_TEMPLATE = '{order_number} - {license_plate}'

/** The name a job had before templates existed, and what an empty result falls back to. */
export const FALLBACK_WORK_ORDER_TITLE = 'New Service Record'

/** The editor's title field takes this many characters, so the template does too. */
export const MAX_WORK_ORDER_TITLE_LENGTH = 100

/** How long a template itself may be in the settings. */
export const MAX_WORK_ORDER_TITLE_TEMPLATE_LENGTH = 200

export type WorkOrderTitleValues = Partial<Record<WorkOrderTitleToken, string | number | null>>

/** Sample values for the settings page's preview. */
export const SAMPLE_WORK_ORDER_TITLE_VALUES: WorkOrderTitleValues = {
  order_number: '2026-1042',
  license_plate: 'AB 12345',
  customer_name: 'Jane Cooper',
  vehicle: '2021 Toyota Camry',
  make: 'Toyota',
  model: 'Camry',
  year: 2021,
  vin: '4T1BF1FK5CU123456',
  technician: 'Sam Lee',
  date: '2026-09-11',
}

const TAG = /\{\s*([A-Za-z0-9_]+)\s*\}/g

/** Characters that only ever join two values, and mean nothing on their own. */
const SEPARATOR = '[-–—·•|/:,;#]'

/** Every tag written in a template, as the token it resolves to, or null for one nobody knows. */
export function tokensIn(template: string): { tag: string; token: WorkOrderTitleToken | null }[] {
  const found: { tag: string; token: WorkOrderTitleToken | null }[] = []
  for (const match of template.matchAll(TAG)) {
    const tag = match[1].toLowerCase()
    found.push({ tag: match[1], token: tokenFor(tag) })
  }
  return found
}

function tokenFor(tag: string): WorkOrderTitleToken | null {
  if ((WORK_ORDER_TITLE_TOKENS as readonly string[]).includes(tag)) {
    return tag as WorkOrderTitleToken
  }
  return TOKEN_ALIASES[tag] ?? null
}

/** The unknown tags in a template, for the settings page to point at. */
export function unknownTokensIn(template: string): string[] {
  return [
    ...new Set(
      tokensIn(template)
        .filter((t) => !t.token)
        .map((t) => `{${t.tag}}`)
    ),
  ]
}

/** Stands in for a tag that had nothing to say, until its separator is gone too. */
const GAP = '\u0000'

/**
 * Removes the tags that came out empty, and the separator each one stood
 * beside, without touching anything the workshop wrote or any value's own
 * punctuation: "WO#{order_number}" keeps its hash and "2026-1042" its dash.
 * A gap takes the separator before it when there is one, otherwise the one
 * after it, so "A - {gap} - B" reads "A - B" and "{gap} - B" reads "B".
 */
function closeGaps(filled: string): string {
  let title = filled
  title = title.replace(new RegExp(`\\s*${SEPARATOR}\\s*${GAP}`, 'g'), '')
  title = title.replace(new RegExp(`${GAP}\\s*${SEPARATOR}\\s*`, 'g'), '')
  title = title.replaceAll(GAP, '')
  // Brackets that closed around nothing: "()" or "[ ]".
  title = title.replace(/[([]\s*[)\]]/g, '')
  return title.replace(/\s+/g, ' ').trim()
}

/**
 * The title a job gets from a template and what is known about it.
 *
 * Empty and unknown tags vanish with their separator, the result is cut to
 * what the title field holds, and nothing at all becomes the fallback name.
 */
export function resolveWorkOrderTitle(
  template: string | null | undefined,
  values: WorkOrderTitleValues,
  fallback = FALLBACK_WORK_ORDER_TITLE
): string {
  if (!template || !template.trim()) return fallback
  const filled = template.replace(TAG, (_whole, tag: string) => {
    const token = tokenFor(tag.toLowerCase())
    if (!token) return GAP
    const value = values[token]
    if (value === null || value === undefined) return GAP
    const text = String(value).trim()
    return text || GAP
  })
  const title = closeGaps(filled).slice(0, MAX_WORK_ORDER_TITLE_LENGTH).trim()
  return title || fallback
}

export interface WorkOrderTitleSubject {
  orderNumber?: string | null
  vehicle?: {
    licensePlate?: string | null
    make?: string | null
    model?: string | null
    year?: number | null
    vin?: string | null
  } | null
  customerName?: string | null
  technicianName?: string | null
  /** The workshop's date, already formatted as YYYY-MM-DD. */
  date?: string | null
}

/** The tag values for one job, from the pieces the draft was made with. */
export function workOrderTitleValues(subject: WorkOrderTitleSubject): WorkOrderTitleValues {
  const vehicle = subject.vehicle
  const year = vehicle?.year && vehicle.year > 0 ? vehicle.year : null
  const vehicleName = [year, vehicle?.make, vehicle?.model]
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== '')
    .join(' ')
  return {
    order_number: subject.orderNumber ?? null,
    license_plate: vehicle?.licensePlate ?? null,
    customer_name: subject.customerName ?? null,
    vehicle: vehicleName || null,
    make: vehicle?.make ?? null,
    model: vehicle?.model ?? null,
    year,
    vin: vehicle?.vin ?? null,
    technician: subject.technicianName ?? null,
    date: subject.date ?? null,
  }
}

/**
 * The template a workshop has chosen, from its settings. Unset means the
 * default; a template deliberately saved empty means the plain fallback
 * name, which is how a workshop that liked things the old way keeps them.
 */
export function workOrderTitleTemplateFrom(
  settings: Record<string, string | undefined>,
  key: string
): string {
  const stored = settings[key]
  if (stored === undefined) return DEFAULT_WORK_ORDER_TITLE_TEMPLATE
  return stored.slice(0, MAX_WORK_ORDER_TITLE_TEMPLATE_LENGTH)
}
