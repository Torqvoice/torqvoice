/**
 * Reading a spreadsheet of reminders and working out, row by row, what each
 * one becomes: a vehicle reminder, a customer reminder, a workshop reminder,
 * or a line the user has to fix. Pure, so the preview and the import run the
 * same code and a test can drive it without a database.
 *
 * The file is laid out like the template, but headers are recognised the way
 * the spreadsheet importer recognises them, so "Reg.nr" or "Kunde" works as
 * well as "License plate" or "Customer".
 */

import { IMPORT_FIELDS } from '@/features/import/Lib/fields'
import {
  cleanText,
  type DateFormat,
  detectDateFormat,
  normalizeHeader,
  normalizeVin,
  parseDate,
  parseInteger,
  plateKey,
} from '@/features/import/Lib/normalize'
import { parseWorkshopDateTime } from '@/lib/workshop-datetime'

/** Enough for any shop's reminder list, small enough to preview in one go. */
export const MAX_REMINDER_IMPORT_ROWS = 2000
/** Under the 1 MB a server action accepts, with room for the form around it. */
export const MAX_REMINDER_IMPORT_BYTES = 900 * 1024

/** Why a whole file was refused, before any row was read. */
export type ReminderImportFileError =
  | 'demo'
  | 'noFile'
  | 'tooLarge'
  | 'unsupported'
  | 'legacyXls'
  | 'empty'
  | 'unreadable'
  | 'tooManyRows'
  | 'noTitleColumn'

export type ReminderColumn =
  | 'title'
  | 'dueDate'
  | 'dueTime'
  | 'dueMileage'
  | 'description'
  | 'licensePlate'
  | 'vin'
  | 'customer'
  | 'emailNotification'

export interface ReminderColumnSpec {
  key: ReminderColumn
  /** Header written to the template. */
  header: string
  required: 'yes' | 'dateOrMileage' | 'no'
}

/** Template order. The dialog lists the columns in the same order. */
export const REMINDER_COLUMNS: readonly ReminderColumnSpec[] = [
  { key: 'title', header: 'Title', required: 'yes' },
  { key: 'dueDate', header: 'Due date', required: 'dateOrMileage' },
  { key: 'dueTime', header: 'Due time', required: 'no' },
  { key: 'dueMileage', header: 'Due mileage', required: 'dateOrMileage' },
  { key: 'description', header: 'Description', required: 'no' },
  { key: 'licensePlate', header: 'License plate', required: 'no' },
  { key: 'vin', header: 'VIN', required: 'no' },
  { key: 'customer', header: 'Customer', required: 'no' },
  { key: 'emailNotification', header: 'Email notification', required: 'no' },
]

/**
 * Three example rows, one per kind of reminder, so the template shows how a
 * vehicle, a customer and a workshop reminder differ.
 */
export const REMINDER_TEMPLATE_ROWS: readonly string[][] = [
  ['Oil change', '2026-11-15', '', '120000', '5W-30, filter in stock', 'AB 12345', '', '', 'yes'],
  ['Call about winter tyres', '2026-10-20', '09:30', '', '', '', '', 'anna@example.com', 'no'],
  ['Renew lift inspection certificate', '2027-01-10', '', '', '', '', '', '', 'no'],
]

function synonymsOf(fieldKey: string): string[] {
  return [...(IMPORT_FIELDS.find((f) => f.key === fieldKey)?.synonyms ?? [])]
}

/**
 * Normalised header names per column. Plate, VIN, customer and mileage reuse
 * the spreadsheet importer's lists, which already cover every locale.
 */
const SYNONYMS: Record<ReminderColumn, readonly string[]> = {
  title: [
    'title',
    'reminder',
    'remindertitle',
    'task',
    ...synonymsOf('service.title').filter((s) => s !== 'description'),
    'paminnelse',
    'erinnerung',
    'recordatorio',
    'rappel',
    'promemoria',
    'przypomnienie',
    'herinnering',
    'hatirlatici',
    'priminimas',
    'napominanie',
    'lembrete',
  ],
  dueDate: [
    'duedate',
    'due',
    'date',
    'duedateday',
    'dueon',
    'reminderdate',
    'dato',
    'forfallsdato',
    'frist',
    'fristdato',
    'datum',
    'falligam',
    'falligkeitsdatum',
    'fecha',
    'fechalimite',
    'fechavencimiento',
    'echeance',
    'dateecheance',
    'scadenza',
    'datascadenza',
    'data',
    'termin',
    'terminwykonania',
    'vervaldatum',
    'tarih',
    'sontarih',
    'terminas',
    'srok',
    'datavencimento',
    'prazo',
  ],
  dueTime: [
    'duetime',
    'time',
    'tid',
    'klokkeslett',
    'klokkeslet',
    'zeit',
    'uhrzeit',
    'hora',
    'heure',
    'ora',
    'godzina',
    'tijd',
    'tijdstip',
    'saat',
    'laikas',
    'vremya',
  ],
  dueMileage: [
    'duemileage',
    'dueodometer',
    'duekm',
    'duemiles',
    'duekilometers',
    'duekilometres',
    'atmileage',
    'atkm',
    ...synonymsOf('vehicle.mileage'),
    'kmstandfallig',
    'forfallkm',
  ],
  description: [...synonymsOf('service.description'), 'notes', 'note', 'comment', 'comments'],
  licensePlate: synonymsOf('vehicle.licensePlate'),
  vin: synonymsOf('vehicle.vin'),
  customer: [
    ...synonymsOf('customer.name').filter((s) => s !== 'name'),
    ...synonymsOf('customer.email'),
    ...synonymsOf('customer.customerNumber').filter((s) => s !== 'number'),
    'customeremail',
  ],
  emailNotification: [
    'emailnotification',
    'emailnotifications',
    'notifyemail',
    'notifybyemail',
    'emailreminder',
    'sendemail',
    'epostvarsel',
    'epostvarsling',
    'varselepost',
    'varslepaepost',
    'emailbenachrichtigung',
    'benachrichtigungperemail',
    'notificacionporcorreo',
    'avisoporcorreo',
    'notificationparemail',
    'notificationemail',
    'notificaemail',
    'notificaviaemail',
    'powiadomienieemail',
    'emailmelding',
    'emailnotificatie',
    'epostabildirimi',
    'pranesimaselpastu',
    'notificacaoporemail',
  ],
}

// ── Headers ───────────────────────────────────────────────────────────────────

export interface ReminderColumnMap {
  /** Column indexes per field. Only `customer` may hold more than one. */
  columns: Partial<Record<ReminderColumn, number[]>>
  /** Headers nothing was read from, shown so a typo does not go unnoticed. */
  ignored: string[]
}

/**
 * Which column holds what. The first column matching a field wins, except for
 * the customer: a file with both a name and an email column tries each.
 */
export function mapReminderColumns(headers: readonly string[]): ReminderColumnMap {
  const columns: Partial<Record<ReminderColumn, number[]>> = {}
  const ignored: string[] = []
  const order = REMINDER_COLUMNS.map((c) => c.key)
  headers.forEach((header, index) => {
    const norm = normalizeHeader(header)
    const key = order.find((k) => SYNONYMS[k].includes(norm))
    if (!key) {
      ignored.push(header)
      return
    }
    const existing = columns[key]
    if (!existing) columns[key] = [index]
    else if (key === 'customer') existing.push(index)
    else ignored.push(header)
  })
  return { columns, ignored }
}

// ── Cells ─────────────────────────────────────────────────────────────────────

/** "14:30", "14.30", "2:30 pm", "9 am", "14:30:00" → "HH:MM". */
export function parseTimeOfDay(value: string | null | undefined): {
  value: string | null
  valid: boolean
} {
  const s = cleanText(value)?.toLowerCase()
  if (!s) return { value: null, valid: true }
  let m = s.match(/^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/)
  let hours: number
  let minutes: number
  let meridiem: string | undefined
  if (m) {
    hours = Number(m[1])
    minutes = Number(m[2])
    meridiem = m[3]
  } else {
    m = s.match(/^(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)$/)
    if (!m) return { value: null, valid: false }
    hours = Number(m[1])
    minutes = 0
    meridiem = m[2]
  }
  if (meridiem) {
    if (hours < 1 || hours > 12) return { value: null, valid: false }
    const pm = meridiem.startsWith('p')
    hours = (hours % 12) + (pm ? 12 : 0)
  }
  if (hours > 23 || minutes > 59) return { value: null, valid: false }
  return {
    value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    valid: true,
  }
}

const YES = new Set([
  'yes',
  'y',
  'true',
  '1',
  'x',
  'on',
  'ja',
  'j',
  'wahr',
  'si',
  'sim',
  'oui',
  'tak',
  'evet',
  'taip',
  'da',
  'да',
])
const NO = new Set([
  'no',
  'n',
  'false',
  '0',
  '-',
  'off',
  'nei',
  'nein',
  'falsch',
  'nee',
  'non',
  'nao',
  'nie',
  'hayir',
  'ne',
  'нет',
])

/** A yes/no cell in any of the app's languages. Empty is "no". */
export function parseYesNo(value: string | null | undefined): { value: boolean; valid: boolean } {
  const s = cleanText(value)?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
  if (!s) return { value: false, valid: true }
  if (YES.has(s)) return { value: true, valid: true }
  if (NO.has(s)) return { value: false, valid: true }
  return { value: false, valid: false }
}

// ── Rows ──────────────────────────────────────────────────────────────────────

export interface ReminderImportVehicle {
  id: string
  licensePlate: string | null
  vin: string | null
  customerId: string | null
  year: number
  make: string
  model: string
}

export interface ReminderImportCustomer {
  id: string
  name: string
  email: string | null
  customerNumber: string | null
}

export interface ReminderImportExisting {
  vehicleId: string | null
  customerId: string | null
  title: string
  dueDate: Date | null
  dueMileage: number | null
}

export interface ReminderImportContext {
  vehicles: readonly ReminderImportVehicle[]
  customers: readonly ReminderImportCustomer[]
  /** Open reminders already in the workshop, for skipping repeats. */
  openReminders: readonly ReminderImportExisting[]
  timeZone: string
}

export type ReminderImportIssue =
  | 'missingTitle'
  | 'missingDue'
  | 'badDate'
  | 'badTime'
  | 'timeWithoutDate'
  | 'badMileage'
  | 'badEmailNotification'
  | 'vehicleNotFound'
  | 'vehicleAmbiguous'
  | 'vehicleMismatch'
  | 'customerNotFound'
  | 'customerAmbiguous'
  | 'duplicateExisting'
  | 'duplicateInFile'

export type ReminderImportTarget =
  | { kind: 'vehicle'; id: string; customerId: string | null; label: string }
  | { kind: 'customer'; id: string; label: string }
  | { kind: 'workshop' }

export interface ReminderImportRow {
  /** Row number as the spreadsheet shows it, header being row 1. */
  line: number
  status: 'ready' | 'duplicate' | 'error'
  issue: ReminderImportIssue | null
  /** What the issue is about, e.g. the plate that was not found. */
  issueValue: string | null
  title: string | null
  description: string | null
  target: ReminderImportTarget | null
  /** Workshop calendar day, YYYY-MM-DD. */
  dueDay: string | null
  /** Workshop wall clock, HH:MM, when the row set one. */
  dueTime: string | null
  /** The instant stored, noon on the day when no time was given. */
  dueAt: Date | null
  dueMileage: number | null
  notifyEmail: boolean
}

export interface ReminderImportPlan {
  rows: ReminderImportRow[]
  /** The date format used, detected unless the caller chose one. */
  dateFormat: DateFormat
  ignoredColumns: string[]
}

function vehicleLabel(v: ReminderImportVehicle): string {
  const name = [v.year || null, v.make, v.model].filter(Boolean).join(' ')
  return v.licensePlate ? `${name} · ${v.licensePlate}` : name
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

type Lookup<T> = { found: T } | { issue: 'notFound' | 'ambiguous' }

function pick<T>(list: T[] | undefined): Lookup<T> {
  if (!list?.length) return { issue: 'notFound' }
  if (list.length > 1) return { issue: 'ambiguous' }
  return { found: list[0] }
}

class Index {
  private byPlate = new Map<string, ReminderImportVehicle[]>()
  private byVin = new Map<string, ReminderImportVehicle[]>()
  private byEmail = new Map<string, ReminderImportCustomer[]>()
  private byNumber = new Map<string, ReminderImportCustomer[]>()
  private byName = new Map<string, ReminderImportCustomer[]>()

  constructor(ctx: ReminderImportContext) {
    for (const v of ctx.vehicles) {
      const p = plateKey(v.licensePlate)
      if (p) pushTo(this.byPlate, p, v)
      const vin = normalizeVin(v.vin).value
      if (vin) pushTo(this.byVin, vin, v)
    }
    for (const c of ctx.customers) {
      if (c.email) pushTo(this.byEmail, c.email.trim().toLowerCase(), c)
      if (c.customerNumber) pushTo(this.byNumber, c.customerNumber.trim().toLowerCase(), c)
      pushTo(this.byName, collapse(c.name), c)
    }
  }

  plate(value: string) {
    return pick(this.byPlate.get(plateKey(value) ?? ''))
  }

  vin(value: string) {
    return pick(this.byVin.get(normalizeVin(value).value ?? ''))
  }

  /** An email, a customer number or the exact name, tried in that order. */
  customer(value: string): Lookup<ReminderImportCustomer> {
    const key = collapse(value)
    if (key.includes('@')) return pick(this.byEmail.get(key))
    const byNumber = this.byNumber.get(key)
    if (byNumber?.length) return pick(byNumber)
    return pick(this.byName.get(key))
  }
}

function targetKey(vehicleId: string | null, customerId: string | null): string {
  return vehicleId ? `v:${vehicleId}` : customerId ? `c:${customerId}` : 'w'
}

function duplicateKey(
  target: string,
  title: string,
  dueAt: Date | null,
  dueMileage: number | null
): string {
  return [target, collapse(title), dueAt?.getTime() ?? '', dueMileage ?? ''].join('|')
}

/** YYYY-MM-DD from the UTC-midnight date parseDate returns. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** A time written into the date cell, "2026-10-15 14:30", as parseDate reads it. */
function timeInDateCell(value: string): string | null {
  const m = value.match(/[T ](\d{1,2}:\d{2})(?::\d{2})?$/)
  return m ? parseTimeOfDay(m[1]).value : null
}

/**
 * Work out every row. Rows are independent: one bad line never stops the
 * others, it is reported with the reason and left out of the import.
 */
export function planReminderImport(
  headers: readonly string[],
  rows: readonly string[][],
  ctx: ReminderImportContext,
  dateFormat: DateFormat = 'auto'
): ReminderImportPlan {
  const { columns, ignored } = mapReminderColumns(headers)
  const cell = (row: readonly string[], key: ReminderColumn): string | null => {
    const index = columns[key]?.[0]
    return index === undefined ? null : cleanText(row[index])
  }

  const format =
    dateFormat === 'auto' ? detectDateFormat(rows.map((r) => cell(r, 'dueDate'))) : dateFormat
  const index = new Index(ctx)
  const seen = new Set(
    ctx.openReminders.map((r) =>
      duplicateKey(targetKey(r.vehicleId, r.customerId), r.title, r.dueDate, r.dueMileage)
    )
  )
  const inFile = new Set<string>()

  const planned = rows.map((row, i): ReminderImportRow => {
    const out: ReminderImportRow = {
      line: i + 2,
      status: 'error',
      issue: null,
      issueValue: null,
      title: cell(row, 'title'),
      description: cell(row, 'description'),
      target: null,
      dueDay: null,
      dueTime: null,
      dueAt: null,
      dueMileage: null,
      notifyEmail: false,
    }
    const fail = (issue: ReminderImportIssue, value: string | null = null) => {
      out.issue = issue
      out.issueValue = value
      return out
    }

    if (!out.title) return fail('missingTitle')

    // Due date and time
    const dateCell = cell(row, 'dueDate')
    const timeCell = cell(row, 'dueTime')
    if (dateCell) {
      const date = parseDate(dateCell, format)
      if (!date || date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2100) {
        return fail('badDate', dateCell)
      }
      out.dueDay = dayKey(date)
    }
    if (timeCell) {
      const time = parseTimeOfDay(timeCell)
      if (!time.valid) return fail('badTime', timeCell)
      if (!out.dueDay) return fail('timeWithoutDate', timeCell)
      out.dueTime = time.value
    } else if (dateCell) {
      out.dueTime = timeInDateCell(dateCell)
    }
    if (out.dueDay) {
      // Same convention as the reminder dialog: a day-only reminder sits at
      // midday in the workshop, so it stays on its day in every zone.
      out.dueAt = parseWorkshopDateTime(`${out.dueDay}T${out.dueTime ?? '12:00'}:00`, ctx.timeZone)
    }

    const mileageCell = cell(row, 'dueMileage')
    if (mileageCell) {
      const mileage = parseInteger(mileageCell)
      if (mileage == null || mileage < 0 || mileage > 10_000_000) {
        return fail('badMileage', mileageCell)
      }
      out.dueMileage = mileage
    }
    if (!out.dueAt && out.dueMileage == null) return fail('missingDue')

    const notify = parseYesNo(cell(row, 'emailNotification'))
    if (!notify.valid) return fail('badEmailNotification', cell(row, 'emailNotification'))
    out.notifyEmail = notify.value

    // What it relates to: the vehicle wins, then the customer, else the workshop.
    const plate = cell(row, 'licensePlate')
    const vin = cell(row, 'vin')
    if (plate || vin) {
      const byPlate = plate ? index.plate(plate) : null
      const byVin = vin ? index.vin(vin) : null
      if (byPlate && 'issue' in byPlate) {
        return fail(byPlate.issue === 'ambiguous' ? 'vehicleAmbiguous' : 'vehicleNotFound', plate)
      }
      if (byVin && 'issue' in byVin) {
        return fail(byVin.issue === 'ambiguous' ? 'vehicleAmbiguous' : 'vehicleNotFound', vin)
      }
      const a = byPlate?.found
      const b = byVin?.found
      if (a && b && a.id !== b.id) return fail('vehicleMismatch', `${plate} / ${vin}`)
      const vehicle = (a ?? b) as ReminderImportVehicle
      out.target = {
        kind: 'vehicle',
        id: vehicle.id,
        customerId: vehicle.customerId,
        label: vehicleLabel(vehicle),
      }
    } else {
      const values = (columns.customer ?? [])
        .map((c) => cleanText(row[c]))
        .filter((v): v is string => Boolean(v))
      let firstIssue: { issue: ReminderImportIssue; value: string } | null = null
      for (const value of values) {
        const match = index.customer(value)
        if ('found' in match) {
          out.target = { kind: 'customer', id: match.found.id, label: match.found.name }
          break
        }
        const issue = match.issue === 'ambiguous' ? 'customerAmbiguous' : 'customerNotFound'
        // A name that fits two customers says more than one that fits none.
        if (!firstIssue || issue === 'customerAmbiguous') firstIssue = { issue, value }
      }
      if (!out.target && firstIssue) return fail(firstIssue.issue, firstIssue.value)
      if (!out.target) out.target = { kind: 'workshop' }
    }

    const target =
      out.target.kind === 'vehicle'
        ? targetKey(out.target.id, null)
        : out.target.kind === 'customer'
          ? targetKey(null, out.target.id)
          : targetKey(null, null)
    const key = duplicateKey(target, out.title, out.dueAt, out.dueMileage)
    if (seen.has(key)) {
      out.status = 'duplicate'
      out.issue = 'duplicateExisting'
      return out
    }
    if (inFile.has(key)) {
      out.status = 'duplicate'
      out.issue = 'duplicateInFile'
      return out
    }
    inFile.add(key)
    out.status = 'ready'
    return out
  })

  return { rows: planned, dateFormat: format, ignoredColumns: ignored }
}
