import { getWarrantyStatus } from '@/lib/warranty'
import { zonedDayKey, zonedParts } from '@/lib/timezone'
import type {
  PortalHomeCar,
  PortalHomeData,
  PortalHomeInvoice,
  PortalHomeJob,
  PortalHomeMessages,
  PortalHomeQuote,
  PortalHomeRequest,
  PortalHomeTireSet,
  PortalHomeVehicle,
  PortalHomeVisit,
  PortalWorkshop,
  PortalJobStage,
  PortalTireSeason,
} from './homeTypes'

/** The statuses of work that is booked or under way: what the home calls a job. */
export const PORTAL_JOB_STATUSES = ['pending', 'scheduled', 'in-progress', 'waiting-parts'] as const

/**
 * Where a job is, for the customer. Nothing stored says "finished and waiting
 * for you": a workshop's own "Ready for pickup" is a free-text label under
 * the completed stage that the app decides nothing by, and a completed job is
 * an invoice here. So this never answers 'ready'.
 */
// 'ready' is not emitted yet: the schema has no "done, waiting for pickup" signal.
export function portalJobStage(status: string): PortalJobStage {
  return status === 'in-progress' || status === 'waiting-parts' ? 'working' : 'booked'
}

type VehicleRow = { id: string; make: string; model: string; licensePlate: string | null } | null

export interface HomeReportRow {
  id: string
  publicToken: string
  message: string | null
  sentAt: Date | null
  viewedAt: Date | null
  createdAt: Date
  expiresAt: Date | null
}

export interface HomeJobRow {
  id: string
  title: string
  status: string
  startDateTime: Date | null
  promisedAt: Date | null
  createdAt: Date
  vehicle: VehicleRow
  /** Only the reports that reached the customer. */
  statusReports: HomeReportRow[]
}

export interface HomeInvoiceRow {
  id: string
  title: string
  invoiceNumber: string | null
  totalAmount: number
  manuallyPaid: boolean
  serviceDate: Date
  invoiceDate: Date | null
  invoiceDueDate: Date | null
  publicToken: string | null
  vehicle: VehicleRow
  payments: { amount: number }[]
}

export interface HomeQuoteRow {
  id: string
  title: string
  quoteNumber: string | null
  status: string
  totalAmount: number
  validUntil: Date | null
  vehicle: VehicleRow
}

export interface HomeRequestRow {
  id: string
  description: string
  preferredDate: Date | null
  createdAt: Date
  vehicle: VehicleRow
}

export interface HomeAppointmentRow {
  id: string
  title: string
  startAt: Date
  vehicle: VehicleRow
}

export interface HomeCarRow {
  id: string
  make: string
  model: string
  year: number | null
  licensePlate: string | null
  mileage: number | null
  /** Every work order on the car. */
  visits: number
}

/** A finished job on one of the customer's cars whose warranty has an end date. */
export interface HomeWarrantyRow {
  vehicleId: string | null
  warrantyExpiresAt: Date | null
  warrantyMileage: number | null
  mileage: number | null
}

export interface HomeTireSetRow {
  id: string
  season: string
  studded: boolean
  brand: string | null
  model: string | null
  size: string | null
  quantity: number
  withRims: boolean
  checkedInAt: Date | null
  createdAt: Date
  vehicle: VehicleRow
  /** Newest first. */
  measurements: { treadDepthMm: number | null; measuredAt: Date; movementId: string | null }[]
}

export interface PortalHomeInput {
  /** The slug or id in the address, for links. */
  orgParam: string
  timeZone: string
  now: Date
  customerName: string
  /** The workshop's service type is 'marine'. */
  marine: boolean
  workshop: PortalWorkshop
  /** Whether the shared invoice page would offer paying online right now. */
  onlinePayment: boolean
  jobs: HomeJobRow[]
  /** Completed records not marked paid by hand. */
  invoices: HomeInvoiceRow[]
  /** Quotes that reached the customer, whatever their status. */
  quotes: HomeQuoteRow[]
  /** Requests the workshop has not acted on. */
  requests: HomeRequestRow[]
  /** Appointments with the customer that have not started yet. */
  appointments: HomeAppointmentRow[]
  cars: HomeCarRow[]
  warranties: HomeWarrantyRow[]
  /** Null when stored tyres are not shown to customers. */
  tires: HomeTireSetRow[] | null
  messages: PortalHomeMessages
}

const iso = (date: Date | null) => (date ? date.toISOString() : null)
const cents = (amount: number) => Math.round(amount * 100) / 100

function vehicleOf(row: VehicleRow): PortalHomeVehicle | null {
  if (!row) return null
  return {
    id: row.id,
    label: `${row.make} ${row.model}`.trim(),
    licensePlate: row.licensePlate,
  }
}

/** Earliest first; rows without a time go last. */
function byTime(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? -1 : 1
}

const reportAt = (report: HomeReportRow) => report.sentAt ?? report.viewedAt ?? report.createdAt

const TIRE_SEASONS: readonly PortalTireSeason[] = ['summer', 'winter', 'all_season', 'other']

/**
 * The shallowest tread of the latest measuring: the readings taken together
 * (one movement, or one moment when no movement groups them), since a set is
 * as worn as its most worn tyre.
 */
function latestTread(rows: HomeTireSetRow['measurements']): number | null {
  const measured = rows.filter((row) => row.treadDepthMm != null)
  if (measured.length === 0) return null
  const newest = measured.reduce((a, b) => (b.measuredAt > a.measuredAt ? b : a))
  const together = measured.filter((row) =>
    newest.movementId
      ? row.movementId === newest.movementId
      : !row.movementId && row.measuredAt.getTime() === newest.measuredAt.getTime()
  )
  return Math.min(...together.map((row) => row.treadDepthMm as number))
}

/**
 * "Kari" of "Kari Nordmann"; the whole name when it is one word. An initial
 * loses its full stop ("K. Nordmann" is "K"), so a greeting that ends the
 * name with one of its own reads "Hi K." and not "Hi K..".
 */
export function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first.replace(/\.+$/, '') || first
}

/**
 * The home, built from the rows. Pure, so the rules a customer would notice
 * (what counts as overdue, what is on top, which visit is next, when tyres
 * show) are tested without a database. Every day is judged on the workshop's
 * calendar.
 */
export function buildPortalHome(input: PortalHomeInput): PortalHomeData {
  const { orgParam, timeZone, now } = input
  const today = zonedDayKey(now, timeZone)

  // ── Jobs ────────────────────────────────────────────────────────────────
  const jobs = input.jobs
    .map((row): PortalHomeJob => {
      const report = row.statusReports
        .filter((r) => !r.expiresAt || r.expiresAt > now)
        .sort((a, b) => reportAt(b).getTime() - reportAt(a).getTime())[0]
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        stage: portalJobStage(row.status),
        vehicle: vehicleOf(row.vehicle),
        startAt: iso(row.startDateTime),
        promisedAt: iso(row.promisedAt),
        update: report
          ? {
              at: reportAt(report).toISOString(),
              url: `/share/status-report/${orgParam}/${report.publicToken}`,
              message: report.message?.trim() || null,
            }
          : null,
      }
    })
    .sort((a, b) => {
      if (a.stage !== b.stage) return a.stage === 'booked' ? 1 : -1
      // Under way: the one promised soonest. Booked: the one coming in first.
      if (a.stage !== 'booked') {
        return byTime(a.promisedAt, b.promisedAt) || byTime(a.startAt, b.startAt)
      }
      return byTime(a.startAt, b.startAt)
    })

  // ── The next visit ──────────────────────────────────────────────────────
  // From today on, on the workshop's calendar: a visit this morning still
  // counts this afternoon, one from yesterday does not.
  const upcoming = (at: string) => zonedDayKey(new Date(at), timeZone) >= today
  const visits: PortalHomeVisit[] = [
    ...jobs
      // What the home leads with is already told; the rest of the booked work is a visit.
      .filter((job, index) => index > 0 && job.stage === 'booked' && job.startAt)
      .map(
        (job): PortalHomeVisit => ({
          id: job.id,
          kind: 'job',
          title: job.title,
          startAt: job.startAt as string,
          vehicle: job.vehicle,
        })
      ),
    ...input.appointments.map(
      (row): PortalHomeVisit => ({
        id: row.id,
        kind: 'appointment',
        title: row.title,
        startAt: row.startAt.toISOString(),
        vehicle: vehicleOf(row.vehicle),
      })
    ),
  ]
  const nextVisit =
    visits
      .filter((visit) => upcoming(visit.startAt))
      .sort((a, b) => byTime(a.startAt, b.startAt))[0] ?? null

  // ── Invoices ────────────────────────────────────────────────────────────
  const toPay: PortalHomeInvoice[] = []
  for (const row of input.invoices) {
    const paid = cents(row.payments.reduce((sum, payment) => sum + payment.amount, 0))
    const balance = cents(row.totalAmount - paid)
    if (row.manuallyPaid || balance <= 0) continue
    toPay.push({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      title: row.title,
      vehicle: vehicleOf(row.vehicle),
      date: (row.invoiceDate ?? row.serviceDate).toISOString(),
      total: row.totalAmount,
      paid,
      balance,
      dueAt: iso(row.invoiceDueDate),
      overdue: row.invoiceDueDate ? zonedDayKey(row.invoiceDueDate, timeZone) < today : false,
      viewUrl: `/portal/${orgParam}/invoices/${row.id}`,
      payUrl:
        row.publicToken && input.onlinePayment
          ? `/share/invoice/${orgParam}/${row.publicToken}`
          : null,
    })
  }
  toPay.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    return byTime(a.dueAt, b.dueAt) || byTime(a.date, b.date)
  })

  // ── Quotes waiting for an answer ────────────────────────────────────────
  const toAnswer = input.quotes
    .filter((row) => row.status === 'sent')
    .filter((row) => !row.validUntil || zonedDayKey(row.validUntil, timeZone) >= today)
    .map(
      (row): PortalHomeQuote => ({
        id: row.id,
        quoteNumber: row.quoteNumber,
        title: row.title,
        vehicle: vehicleOf(row.vehicle),
        total: row.totalAmount,
        validUntil: iso(row.validUntil),
        url: `/portal/${orgParam}/quotes/${row.id}`,
      })
    )
    .sort((a, b) => byTime(a.validUntil, b.validUntil))

  // ── Requests ────────────────────────────────────────────────────────────
  const requests: PortalHomeRequest[] = [...input.requests]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      description: row.description,
      vehicle: vehicleOf(row.vehicle),
      createdAt: row.createdAt.toISOString(),
      preferredDate: iso(row.preferredDate),
    }))

  // ── Cars ────────────────────────────────────────────────────────────────
  const inWorkshop = new Set(
    jobs.filter((job) => job.stage !== 'booked' && job.vehicle).map((job) => job.vehicle?.id)
  )
  const cars = input.cars
    .map((row): PortalHomeCar => {
      const states = input.warranties
        .filter((w) => w.vehicleId === row.id)
        .map((w) =>
          getWarrantyStatus(w.warrantyExpiresAt, w.warrantyMileage, w.mileage, row.mileage)
        )
      return {
        id: row.id,
        label: `${row.make} ${row.model}`.trim(),
        licensePlate: row.licensePlate,
        year: row.year,
        visits: row.visits,
        inWorkshop: inWorkshop.has(row.id),
        warranty: states.includes('active')
          ? 'active'
          : states.includes('expiring')
            ? 'expiring'
            : null,
        url: `/portal/${orgParam}/vehicles/${row.id}`,
      }
    })
    .sort((a, b) => {
      if (a.inWorkshop !== b.inWorkshop) return a.inWorkshop ? -1 : 1
      return a.label.localeCompare(b.label)
    })

  // ── Stored tyres ────────────────────────────────────────────────────────
  const tires: PortalHomeTireSet[] | null = input.tires
    ? input.tires.map((row) => ({
        id: row.id,
        season: TIRE_SEASONS.includes(row.season as PortalTireSeason)
          ? (row.season as PortalTireSeason)
          : 'other',
        studded: row.studded,
        brand: row.brand?.trim() || null,
        model: row.model?.trim() || null,
        size: row.size?.trim() || null,
        quantity: row.quantity,
        withRims: row.withRims,
        treadDepthMm: latestTread(row.measurements),
        storedSince: (row.checkedInAt ?? row.createdAt).toISOString(),
        vehicle: vehicleOf(row.vehicle),
      }))
    : null

  return {
    customerName: input.customerName,
    customerFirstName: firstNameOf(input.customerName),
    marine: input.marine,
    workshop: input.workshop,
    jobs,
    nextVisit,
    toAnswer,
    toPay,
    toPayTotal: cents(toPay.reduce((sum, invoice) => sum + invoice.balance, 0)),
    toPayCount: toPay.length,
    toPayOverdueCount: toPay.filter((invoice) => invoice.overdue).length,
    cars,
    tires,
    requests,
    messages: input.messages,
  }
}

/**
 * Where the workshop is in its day: today's open stretches on its own clock,
 * whether it is in one now, when that one ends and when the next begins.
 * `intervals` are today's open stretches as instants.
 */
export function workshopHoursNow(
  intervals: { start: Date; end: Date }[],
  now: Date,
  timeZone: string
): Pick<PortalWorkshop, 'openToday' | 'openNow' | 'closesAt' | 'opensAt'> {
  const clock = (at: Date) => {
    const p = zonedParts(at, timeZone)
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  }
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime())
  const current = sorted.find((i) => now >= i.start && now < i.end)
  const next = current ? undefined : sorted.find((i) => i.start > now)
  return {
    openToday: sorted.map((i) => ({ start: clock(i.start), end: clock(i.end) })),
    openNow: Boolean(current),
    closesAt: current ? clock(current.end) : null,
    opensAt: next ? clock(next.start) : null,
  }
}

/**
 * Today's hours in one line, the same everywhere: open now until the stretch
 * it is in ends (noon, for a workshop that shuts for lunch), opening later
 * today, closed for the rest of today, or not open today at all. The caller
 * turns the key into words from `portal.hoursLine`.
 */
export function workshopHoursLine(
  workshop: Pick<PortalWorkshop, 'openToday' | 'openNow' | 'closesAt' | 'opensAt'>
):
  | { key: 'openUntil' | 'opensAt'; time: string }
  | { key: 'closedNow' | 'closedToday'; time?: undefined } {
  const last = workshop.openToday[workshop.openToday.length - 1]
  if (!last) return { key: 'closedToday' }
  if (workshop.openNow) return { key: 'openUntil', time: workshop.closesAt ?? last.end }
  if (workshop.opensAt) return { key: 'opensAt', time: workshop.opensAt }
  return { key: 'closedNow' }
}
