import 'server-only'
import { db } from '@/lib/db'
import { zonedDayKey } from '@/lib/timezone'

/**
 * Everything the model is allowed to know when someone asks about one
 * vehicle or one customer.
 *
 * The chat has no tools and writes no queries. The record is loaded here, by
 * its id and the caller's organization, through the same Prisma calls the
 * page itself makes, and handed to the model as text. Another workshop's
 * data never enters the request because nothing here can ask for it. What
 * the model gets is bounded by the counts below and by a character budget,
 * so a fleet vehicle with a decade of history still fits a small local
 * model's window.
 */

export type AskAiSubject = { type: 'vehicle'; id: string } | { type: 'customer'; id: string }

export interface AskAiContextOptions {
  /**
   * Whether prices, totals and payments go in. A user without permission to
   * read work orders does not see money in the app and must not be able to
   * ask the model for it instead.
   */
  showMoney: boolean
  currencyCode: string
  unitSystem: 'metric' | 'imperial'
  timeZone: string
}

export interface AskAiContext {
  /** Short name of the record, for the sheet title and the chat title. */
  title: string
  /** The text the model sees. */
  text: string
  /** True when the budget cut some records out, so the prompt can say so. */
  truncated: boolean
}

/** Upper bound on the context text. Roughly 12k tokens of English. */
export const MAX_CONTEXT_CHARS = 48_000

const RECENT_JOBS_IN_DETAIL = 25
const OLDER_JOBS_ONE_LINE = 150
const MAX_NOTES = 30
const MAX_INSPECTIONS = 10
const MAX_QUOTES = 20
const MAX_FUEL_LOGS = 15
const MAX_FINDINGS = 40
const MAX_REMINDERS = 40
const MAX_CUSTOMER_VEHICLES = 40
const MAX_CUSTOMER_JOBS = 60
const MAX_MESSAGES = 40
const MAX_FREE_TEXT = 400

/** Lines are appended in order of usefulness until the budget runs out. */
class Budget {
  private lines: string[] = []
  private used = 0
  truncated = false

  add(line: string): boolean {
    if (this.truncated) return false
    if (this.used + line.length + 1 > MAX_CONTEXT_CHARS) {
      this.truncated = true
      this.lines.push('[... more records exist but were left out for length]')
      return false
    }
    this.lines.push(line)
    this.used += line.length + 1
    return true
  }

  /** Adds a whole section; stops quietly once over budget. */
  section(heading: string, body: string[]): void {
    if (body.length === 0) return
    if (!this.add('')) return
    if (!this.add(`## ${heading}`)) return
    for (const line of body) if (!this.add(line)) return
  }

  toString(): string {
    return this.lines.join('\n')
  }
}

function clip(value: string | null | undefined, max = MAX_FREE_TEXT): string {
  if (!value) return ''
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function money(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return ''
  return `${amount.toFixed(2)} ${currency}`
}

function dayOf(date: Date | null | undefined, timeZone: string): string {
  return date ? zonedDayKey(date, timeZone) : ''
}

function fields(parts: Array<[string, string | number | null | undefined]>): string {
  return parts
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
}

type JobRow = {
  id: string
  title: string
  description: string | null
  diagnosticNotes: string | null
  type: string
  status: string
  cost: number
  totalAmount: number
  mileage: number | null
  serviceDate: Date
  startDateTime: Date | null
  invoiceNumber: string | null
  manuallyPaid: boolean
  technician: { name: string } | null
  vehicle: {
    id: string
    year: number
    make: string
    model: string
    licensePlate: string | null
  } | null
  partItems: { name: string; quantity: number; unitPrice: number; total: number }[]
  laborItems: { description: string; hours: number; total: number }[]
  payments: { amount: number; date: Date; method: string }[]
}

const jobSelect = {
  id: true,
  title: true,
  description: true,
  diagnosticNotes: true,
  type: true,
  status: true,
  cost: true,
  totalAmount: true,
  mileage: true,
  serviceDate: true,
  startDateTime: true,
  invoiceNumber: true,
  manuallyPaid: true,
  technician: { select: { name: true } },
  vehicle: { select: { id: true, year: true, make: true, model: true, licensePlate: true } },
  partItems: { select: { name: true, quantity: true, unitPrice: true, total: true } },
  laborItems: { select: { description: true, hours: true, total: true } },
  payments: {
    select: { amount: true, date: true, method: true },
    orderBy: { date: 'asc' as const },
  },
} as const

function effectiveTotal(job: JobRow): number {
  return job.totalAmount > 0 ? job.totalAmount : job.cost
}

function paymentState(job: JobRow): string {
  if (job.manuallyPaid) return 'paid'
  const paid = job.payments.reduce((sum, p) => sum + p.amount, 0)
  const total = effectiveTotal(job)
  if (total <= 0) return 'nothing to pay'
  if (paid >= total) return 'paid'
  return paid > 0 ? 'partly paid' : 'unpaid'
}

function jobOneLine(job: JobRow, o: AskAiContextOptions, withVehicle: boolean): string {
  const date = dayOf(job.startDateTime ?? job.serviceDate, o.timeZone)
  const vehicle =
    withVehicle && job.vehicle
      ? `${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}${job.vehicle.licensePlate ? ` (${job.vehicle.licensePlate})` : ''}`
      : withVehicle
        ? 'no vehicle (counter sale)'
        : ''
  const parts: Array<[string, string | number | null | undefined]> = [
    ['date', date],
    ['vehicle', vehicle || undefined],
    ['status', job.status],
    ['type', job.type],
    ['invoice', job.invoiceNumber],
    ['mileage', job.mileage],
  ]
  if (o.showMoney) {
    parts.push(
      ['total', money(effectiveTotal(job), o.currencyCode)],
      ['payment', paymentState(job)]
    )
  }
  return `- ${job.title} [${fields(parts)}]`
}

function jobDetail(job: JobRow, o: AskAiContextOptions, withVehicle: boolean): string[] {
  const lines = [jobOneLine(job, o, withVehicle).replace(/^- /, `### `)]
  const link = job.vehicle ? `/vehicles/${job.vehicle.id}/service/${job.id}` : `/sales/${job.id}`
  lines.push(`link: ${link}`)
  if (job.technician) lines.push(`technician: ${job.technician.name}`)
  if (job.description) lines.push(`description: ${clip(job.description)}`)
  if (job.diagnosticNotes) lines.push(`diagnostic notes: ${clip(job.diagnosticNotes)}`)
  if (job.partItems.length > 0) {
    lines.push(
      `parts: ${job.partItems
        .map((p) =>
          o.showMoney
            ? `${p.name} x${p.quantity} (${money(p.total, o.currencyCode)})`
            : `${p.name} x${p.quantity}`
        )
        .join('; ')}`
    )
  }
  if (job.laborItems.length > 0) {
    lines.push(
      `labour: ${job.laborItems
        .map((l) =>
          o.showMoney
            ? `${l.description} ${l.hours}h (${money(l.total, o.currencyCode)})`
            : `${l.description} ${l.hours}h`
        )
        .join('; ')}`
    )
  }
  if (o.showMoney && job.payments.length > 0) {
    lines.push(
      `payments: ${job.payments
        .map(
          (p) => `${money(p.amount, o.currencyCode)} on ${dayOf(p.date, o.timeZone)} (${p.method})`
        )
        .join('; ')}`
    )
  }
  return lines
}

async function vehicleContext(
  organizationId: string,
  vehicleId: string,
  o: AskAiContextOptions
): Promise<AskAiContext | null> {
  const distance = o.unitSystem === 'metric' ? 'km' : 'mi'
  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      vin: true,
      licensePlate: true,
      color: true,
      mileage: true,
      fuelType: true,
      transmission: true,
      engineSize: true,
      engineCode: true,
      purchaseDate: true,
      purchasePrice: true,
      isArchived: true,
      archiveReason: true,
      customer: { select: { id: true, name: true, company: true, phone: true, email: true } },
      serviceRecords: {
        select: jobSelect,
        orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
        take: RECENT_JOBS_IN_DETAIL + OLDER_JOBS_ONE_LINE,
      },
      findings: {
        where: { status: 'open' },
        select: { description: true, severity: true, notes: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_FINDINGS,
      },
      reminders: {
        where: { isCompleted: false },
        select: { title: true, description: true, dueDate: true, dueMileage: true },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
        take: MAX_REMINDERS,
      },
      notes: {
        select: { title: true, content: true, isPinned: true, createdAt: true },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        take: MAX_NOTES,
      },
      inspections: {
        select: {
          id: true,
          status: true,
          mileage: true,
          notes: true,
          completedAt: true,
          createdAt: true,
          nextTestDue: true,
          template: { select: { name: true } },
          items: {
            where: { condition: { in: ['fail', 'dangerous', 'attention'] } },
            select: { name: true, section: true, condition: true, notes: true },
          },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_INSPECTIONS,
      },
      quotes: {
        select: {
          id: true,
          quoteNumber: true,
          title: true,
          status: true,
          totalAmount: true,
          validUntil: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_QUOTES,
      },
      fuelLogs: {
        select: { date: true, mileage: true, gallons: true, totalCost: true, isFillUp: true },
        orderBy: { date: 'desc' },
        take: MAX_FUEL_LOGS,
      },
    },
  })
  if (!vehicle) return null

  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const b = new Budget()
  b.add(`# Vehicle: ${title}${vehicle.licensePlate ? ` (${vehicle.licensePlate})` : ''}`)
  b.add(`link: /vehicles/${vehicle.id}`)
  b.add(
    fields([
      ['VIN', vehicle.vin],
      ['colour', vehicle.color],
      [`mileage (${distance})`, vehicle.mileage],
      ['fuel', vehicle.fuelType],
      ['transmission', vehicle.transmission],
      ['engine', vehicle.engineSize],
      ['engine code', vehicle.engineCode],
      ['purchased', dayOf(vehicle.purchaseDate, o.timeZone)],
      ['purchase price', o.showMoney ? money(vehicle.purchasePrice, o.currencyCode) : undefined],
      ['archived', vehicle.isArchived ? (vehicle.archiveReason ?? 'yes') : undefined],
    ])
  )
  if (vehicle.customer) {
    b.add(
      `owner: ${fields([
        ['name', vehicle.customer.name],
        ['company', vehicle.customer.company],
        ['phone', vehicle.customer.phone],
        ['email', vehicle.customer.email],
        ['link', `/customers/${vehicle.customer.id}`],
      ])}`
    )
  } else {
    b.add('owner: none recorded')
  }

  const recent = vehicle.serviceRecords.slice(0, RECENT_JOBS_IN_DETAIL)
  const older = vehicle.serviceRecords.slice(RECENT_JOBS_IN_DETAIL)
  b.section(
    `Service history, most recent first (${vehicle.serviceRecords.length} jobs loaded)`,
    recent.flatMap((job) => jobDetail(job, o, false))
  )
  b.section(
    'Older jobs, one line each',
    older.map((job) => jobOneLine(job, o, false))
  )
  b.section(
    'Open findings (problems noticed but not yet fixed)',
    vehicle.findings.map(
      (f) =>
        `- ${clip(f.description, 200)} [severity: ${f.severity}, noted: ${dayOf(f.createdAt, o.timeZone)}]${f.notes ? ` notes: ${clip(f.notes, 200)}` : ''}`
    )
  )
  b.section(
    'Open reminders',
    vehicle.reminders.map(
      (r) =>
        `- ${r.title} [${fields([
          ['due', dayOf(r.dueDate, o.timeZone)],
          [`due at ${distance}`, r.dueMileage],
        ])}]${r.description ? ` ${clip(r.description, 200)}` : ''}`
    )
  )
  b.section(
    'Notes',
    vehicle.notes.map(
      (n) =>
        `- ${n.isPinned ? '[pinned] ' : ''}${n.title} (${dayOf(n.createdAt, o.timeZone)}): ${clip(n.content)}`
    )
  )
  b.section(
    'Inspections, most recent first',
    vehicle.inspections.flatMap((i) => {
      const head = `- ${i.template.name} [${fields([
        ['status', i.status],
        ['date', dayOf(i.completedAt ?? i.createdAt, o.timeZone)],
        ['mileage', i.mileage],
        ['items checked', i._count.items],
        ['next test due', dayOf(i.nextTestDue, o.timeZone)],
        ['link', `/inspections/${i.id}`],
      ])}]`
      const items = i.items.map(
        (it) =>
          `    - ${it.section} / ${it.name}: ${it.condition}${it.notes ? ` (${clip(it.notes, 150)})` : ''}`
      )
      const notes = i.notes ? [`    notes: ${clip(i.notes, 200)}`] : []
      return [head, ...items, ...notes]
    })
  )
  b.section(
    'Quotes, most recent first',
    vehicle.quotes.map(
      (q) =>
        `- ${q.title} [${fields([
          ['number', q.quoteNumber],
          ['status', q.status],
          ['date', dayOf(q.createdAt, o.timeZone)],
          ['valid until', dayOf(q.validUntil, o.timeZone)],
          ['total', o.showMoney ? money(q.totalAmount, o.currencyCode) : undefined],
          ['link', `/quotes/${q.id}`],
        ])}]`
    )
  )
  b.section(
    'Fuel logs, most recent first',
    vehicle.fuelLogs.map(
      (f) =>
        `- ${fields([
          ['date', dayOf(f.date, o.timeZone)],
          [`mileage (${distance})`, f.mileage],
          ['volume', f.gallons],
          ['cost', o.showMoney ? money(f.totalCost, o.currencyCode) : undefined],
          ['fill-up', f.isFillUp ? 'yes' : 'no'],
        ])}`
    )
  )

  return { title, text: b.toString(), truncated: b.truncated }
}

async function customerContext(
  organizationId: string,
  customerId: string,
  o: AskAiContextOptions
): Promise<AskAiContext | null> {
  const distance = o.unitSystem === 'metric' ? 'km' : 'mi'
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId },
    select: {
      id: true,
      customerNumber: true,
      name: true,
      company: true,
      email: true,
      phone: true,
      address: true,
      taxExempt: true,
      reminderOptOut: true,
      notes: true,
      createdAt: true,
      vehicles: {
        select: {
          id: true,
          year: true,
          make: true,
          model: true,
          licensePlate: true,
          mileage: true,
          isArchived: true,
          _count: { select: { serviceRecords: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_CUSTOMER_VEHICLES,
      },
      quotes: {
        select: {
          id: true,
          quoteNumber: true,
          title: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          vehicle: { select: { year: true, make: true, model: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_QUOTES,
      },
      reminders: {
        where: { isCompleted: false },
        select: { title: true, dueDate: true },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
        take: MAX_REMINDERS,
      },
      smsMessages: {
        select: { direction: true, body: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_MESSAGES,
      },
      telegramMessages: {
        select: { direction: true, body: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_MESSAGES,
      },
      whatsappMessages: {
        select: { direction: true, body: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_MESSAGES,
      },
    },
  })
  if (!customer) return null

  // Jobs on the customer's vehicles plus counter sales billed to them
  // directly, the same set the customer page's invoices tab shows.
  const jobs = (await db.serviceRecord.findMany({
    where: {
      organizationId,
      OR: [{ customerId: customer.id }, { vehicle: { customerId: customer.id } }],
    },
    select: jobSelect,
    orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
    take: MAX_CUSTOMER_JOBS,
  })) as JobRow[]

  const b = new Budget()
  b.add(`# Customer: ${customer.name}${customer.company ? ` (${customer.company})` : ''}`)
  b.add(`link: /customers/${customer.id}`)
  b.add(
    fields([
      ['customer number', customer.customerNumber],
      ['phone', customer.phone],
      ['email', customer.email],
      ['address', clip(customer.address, 200)],
      ['tax exempt', customer.taxExempt ? 'yes' : undefined],
      ['opted out of reminders and campaigns', customer.reminderOptOut ? 'yes' : undefined],
      ['customer since', dayOf(customer.createdAt, o.timeZone)],
    ])
  )
  if (customer.notes) b.add(`notes: ${clip(customer.notes)}`)

  b.section(
    `Vehicles (${customer.vehicles.length})`,
    customer.vehicles.map(
      (v) =>
        `- ${v.year} ${v.make} ${v.model} [${fields([
          ['plate', v.licensePlate],
          [`mileage (${distance})`, v.mileage],
          ['jobs', v._count.serviceRecords],
          ['archived', v.isArchived ? 'yes' : undefined],
          ['link', `/vehicles/${v.id}`],
        ])}]`
    )
  )
  b.section(
    `Jobs and invoices, most recent first (${jobs.length} loaded)`,
    jobs.map((job) => jobOneLine(job, o, true))
  )
  b.section(
    'Quotes, most recent first',
    customer.quotes.map(
      (q) =>
        `- ${q.title} [${fields([
          ['number', q.quoteNumber],
          ['status', q.status],
          ['date', dayOf(q.createdAt, o.timeZone)],
          [
            'vehicle',
            q.vehicle ? `${q.vehicle.year} ${q.vehicle.make} ${q.vehicle.model}` : undefined,
          ],
          ['total', o.showMoney ? money(q.totalAmount, o.currencyCode) : undefined],
          ['link', `/quotes/${q.id}`],
        ])}]`
    )
  )
  b.section(
    'Open reminders',
    customer.reminders.map(
      (r) => `- ${r.title} [due: ${dayOf(r.dueDate, o.timeZone) || 'no date'}]`
    )
  )

  const messages = [
    ...customer.smsMessages.map((m) => ({ ...m, channel: 'SMS' })),
    ...customer.telegramMessages.map((m) => ({ ...m, channel: 'Telegram' })),
    ...customer.whatsappMessages.map((m) => ({ ...m, channel: 'WhatsApp' })),
  ]
    .filter((m) => m.body)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MAX_MESSAGES)
  b.section(
    'Messages with the customer, most recent first',
    messages.map(
      (m) =>
        `- ${dayOf(m.createdAt, o.timeZone)} ${m.channel} ${m.direction === 'inbound' ? 'from customer' : 'from workshop'}: ${clip(m.body, 300)}`
    )
  )

  return { title: customer.name, text: b.toString(), truncated: b.truncated }
}

export async function buildAskAiContext(
  organizationId: string,
  subject: AskAiSubject,
  options: AskAiContextOptions
): Promise<AskAiContext | null> {
  return subject.type === 'vehicle'
    ? vehicleContext(organizationId, subject.id, options)
    : customerContext(organizationId, subject.id, options)
}

/**
 * The instructions around the record. Kept apart from the data so the model
 * is told, in its own section, what the data is and what it must not do.
 */
export function askAiSystemPrompt(input: {
  workshopName: string
  subject: AskAiSubject
  context: AskAiContext
  options: AskAiContextOptions
  today: string
  languageName: string | null
}): string {
  const { subject, context, options } = input
  const what = subject.type === 'vehicle' ? 'one vehicle' : 'one customer'
  const language = input.languageName
    ? `Always answer in ${input.languageName}, whatever language the question is in.`
    : 'Answer in the language the question is written in.'
  const moneyNote = options.showMoney
    ? `Amounts are in ${options.currencyCode}.`
    : 'Prices, totals and payments were deliberately left out because this user is not allowed to see them. If asked about money, say you cannot see amounts for this user; never guess.'
  const truncatedNote = context.truncated
    ? 'The record was too long to include in full and the oldest entries were left out. Say so if a question seems to depend on them.'
    : ''
  return `You are the assistant built into TorqVoice, a workshop management system, helping the staff of ${input.workshopName}. You are answering questions about ${what}: ${context.title}. Everything you know about it is in the RECORD section below. Today is ${input.today}.

Rules:
- Answer only from the record. If the record does not contain the answer, say so plainly. Never invent jobs, dates, parts, amounts or contact details.
- You cannot look anything else up, change any data, send messages or take actions. If asked to, say what the user can do in the app instead.
- Be concise. Use short paragraphs, or a markdown list or table when listing several items. No preamble.
- When you mention a job, vehicle, customer, quote or inspection that has a link in the record, make its name a markdown link to that path, for example [Oil change](/vehicles/abc/service/def).
- Distances are in ${options.unitSystem === 'metric' ? 'kilometres' : 'miles'}. ${moneyNote}
- Dates in the record are YYYY-MM-DD.
- ${language}
${truncatedNote ? `- ${truncatedNote}\n` : ''}
RECORD:
${context.text}`
}
