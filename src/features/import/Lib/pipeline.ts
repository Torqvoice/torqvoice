/**
 * From mapped columns to a plan of what the import will do.
 *
 * Everything here is pure. The caller fetches what already exists, hands it
 * in, and gets back one decision per row: create, update, skip, or error,
 * with the normalised values that decision would write. That plan is what the
 * dry run shows the user, and it is exactly what the commit then executes, so
 * the preview cannot drift from the result.
 */

import type { ImportEntity } from './fields'
import {
  type DateFormat,
  type DecimalSeparator,
  cleanText,
  joinAddress,
  joinName,
  mapFuelType,
  mapTransmission,
  normalizeEmail,
  normalizePhone,
  normalizePlate,
  normalizeVin,
  parseDate,
  parseInteger,
  parseNumber,
  parseYear,
  phoneKey,
  plateKey,
  splitVehicleDescription,
} from './normalize'
import type { ColumnMapping } from './suggest'

export type DuplicateRule = 'skip' | 'update' | 'create'

export interface ImportOptions {
  entity: ImportEntity
  dateFormat: DateFormat
  decimalSeparator: DecimalSeparator
  defaultCountryCode: string | null
  duplicates: DuplicateRule
}

export interface CustomerDraft {
  name: string | null
  customerNumber: string | null
  email: string | null
  phone: string | null
  company: string | null
  address: string | null
  taxId: string | null
  notes: string | null
}

export interface VehicleDraft {
  make: string | null
  model: string | null
  year: number | null
  vin: string | null
  licensePlate: string | null
  color: string | null
  mileage: number | null
  fuelType: string | null
  transmission: string | null
  engineSize: string | null
  engineCode: string | null
  /** ISO date, so the plan survives JSON. */
  purchaseDate: string | null
  purchasePrice: number | null
}

export interface ServiceDraft {
  date: string | null
  title: string | null
  description: string | null
  total: number | null
  mileage: number | null
  invoiceNumber: string | null
  notes: string | null
  technician: string | null
}

export type RowIssueCode =
  | 'customer_name_required'
  | 'invalid_email'
  | 'invalid_vin'
  | 'vehicle_make_model_required'
  | 'vehicle_year_required'
  | 'vehicle_year_invalid'
  | 'vehicle_identifier_required'
  | 'vehicle_not_found'
  | 'service_date_required'
  | 'service_date_invalid'
  | 'service_title_required'
  | 'invalid_date'
  | 'invalid_number'
  | 'duplicate_invoice_number'
  | 'write_failed'

export interface RowIssue {
  code: RowIssueCode
  /** Field key the issue is about, when there is one. */
  field?: string
  /** The offending value, for the message. */
  value?: string
}

export type RowAction = 'create' | 'update' | 'skip' | 'error'

export interface CustomerMatch {
  id: string
  name: string
  on: 'number' | 'email' | 'phone' | 'name'
}

export interface VehicleMatch {
  id: string
  label: string
  on: 'vin' | 'plate' | 'makeModelYear'
}

export interface RowPlan {
  /** 0-based data row index; the spreadsheet row is index + 2. */
  index: number
  action: RowAction
  errors: RowIssue[]
  warnings: RowIssue[]
  customer?: CustomerDraft
  vehicle?: VehicleDraft
  service?: ServiceDraft
  customerMatch?: CustomerMatch
  vehicleMatch?: VehicleMatch
  /** Earlier row that carries the same customer, so it is created once and shared. */
  customerSameAs?: number
  vehicleSameAs?: number
  /** Whether this row is where its customer/vehicle gets created. */
  createsCustomer: boolean
  createsVehicle: boolean
}

export interface PlanSummary {
  total: number
  create: number
  update: number
  skip: number
  error: number
  customersToCreate: number
  customersToUpdate: number
  vehiclesToCreate: number
  vehiclesToUpdate: number
  servicesToCreate: number
}

export interface ImportPlan {
  rows: RowPlan[]
  summary: PlanSummary
}

export interface ExistingCustomer {
  id: string
  name: string
  customerNumber: string | null
  email: string | null
  phone: string | null
}

export interface ExistingVehicle {
  id: string
  make: string
  model: string
  year: number
  vin: string | null
  licensePlate: string | null
  customerId: string | null
}

export interface ExistingData {
  customers: ExistingCustomer[]
  vehicles: ExistingVehicle[]
  /** Invoice numbers already in use, so a re-imported history does not double up. */
  invoiceNumbers: string[]
}

/** Per-row choices the user made in the preview. */
export type RowOverrides = Record<string, RowAction>

// ── Extraction ────────────────────────────────────────────────────────────────

type Values = Record<string, string>

/** Pick the mapped cells of one row, keyed by field. */
function valuesOf(row: readonly string[], mapping: ColumnMapping): Values {
  const out: Values = {}
  for (const [col, key] of Object.entries(mapping)) {
    if (!key) continue
    const v = row[Number(col)]
    if (v != null && String(v).trim()) out[key] = String(v)
  }
  return out
}

function hasGroup(values: Values, group: string): boolean {
  return Object.keys(values).some((k) => k.startsWith(`${group}.`))
}

function extractCustomer(
  v: Values,
  options: ImportOptions,
  errors: RowIssue[],
  warnings: RowIssue[]
): CustomerDraft {
  const name =
    cleanText(v['customer.name']) ??
    joinName(cleanText(v['customer.firstName']), cleanText(v['customer.lastName']))
  const email = normalizeEmail(v['customer.email'])
  if (!email.valid)
    warnings.push({ code: 'invalid_email', field: 'customer.email', value: v['customer.email'] })
  const address =
    cleanText(v['customer.address']) ??
    joinAddress({
      street: cleanText(v['customer.street']),
      postalCode: cleanText(v['customer.postalCode']),
      city: cleanText(v['customer.city']),
      state: cleanText(v['customer.state']),
      country: cleanText(v['customer.country']),
    })
  const company = cleanText(v['customer.company'])
  return {
    name: name ?? company,
    customerNumber: cleanText(v['customer.customerNumber']),
    email: email.valid ? email.value : null,
    phone: normalizePhone(v['customer.phone'], options.defaultCountryCode),
    company,
    address,
    taxId: cleanText(v['customer.taxId']),
    notes: cleanText(v['customer.notes']),
  }
}

function extractVehicle(
  v: Values,
  options: ImportOptions,
  errors: RowIssue[],
  warnings: RowIssue[]
): VehicleDraft {
  const described = splitVehicleDescription(v['vehicle.description'])
  const make = cleanText(v['vehicle.make']) ?? described.make
  const model = cleanText(v['vehicle.model']) ?? described.model
  let year: number | null = null
  if (v['vehicle.year'] != null) {
    year = parseYear(v['vehicle.year'])
    if (year == null)
      errors.push({ code: 'vehicle_year_invalid', field: 'vehicle.year', value: v['vehicle.year'] })
  } else {
    year = described.year
  }
  const vin = normalizeVin(v['vehicle.vin'])
  if (!vin.valid)
    warnings.push({ code: 'invalid_vin', field: 'vehicle.vin', value: v['vehicle.vin'] })

  let purchaseDate: string | null = null
  if (v['vehicle.purchaseDate']) {
    const d = parseDate(v['vehicle.purchaseDate'], options.dateFormat)
    if (d) purchaseDate = d.toISOString()
    else
      warnings.push({
        code: 'invalid_date',
        field: 'vehicle.purchaseDate',
        value: v['vehicle.purchaseDate'],
      })
  }
  let mileage: number | null = null
  if (v['vehicle.mileage']) {
    mileage = parseInteger(v['vehicle.mileage'], options.decimalSeparator)
    if (mileage == null)
      warnings.push({
        code: 'invalid_number',
        field: 'vehicle.mileage',
        value: v['vehicle.mileage'],
      })
    else if (mileage < 0) mileage = null
  }
  let purchasePrice: number | null = null
  if (v['vehicle.purchasePrice']) {
    purchasePrice = parseNumber(v['vehicle.purchasePrice'], options.decimalSeparator)
    if (purchasePrice == null)
      warnings.push({
        code: 'invalid_number',
        field: 'vehicle.purchasePrice',
        value: v['vehicle.purchasePrice'],
      })
  }

  return {
    make,
    model,
    year,
    vin: vin.value,
    licensePlate: normalizePlate(v['vehicle.licensePlate']),
    color: cleanText(v['vehicle.color']),
    mileage,
    fuelType: mapFuelType(v['vehicle.fuelType']),
    transmission: mapTransmission(v['vehicle.transmission']),
    engineSize: cleanText(v['vehicle.engineSize']),
    engineCode: cleanText(v['vehicle.engineCode']),
    purchaseDate,
    purchasePrice,
  }
}

function extractService(
  v: Values,
  options: ImportOptions,
  errors: RowIssue[],
  warnings: RowIssue[]
): ServiceDraft {
  let date: string | null = null
  if (v['service.date']) {
    const d = parseDate(v['service.date'], options.dateFormat)
    if (d) date = d.toISOString()
    else
      errors.push({ code: 'service_date_invalid', field: 'service.date', value: v['service.date'] })
  } else {
    errors.push({ code: 'service_date_required', field: 'service.date' })
  }
  let total: number | null = null
  if (v['service.total']) {
    total = parseNumber(v['service.total'], options.decimalSeparator)
    if (total == null)
      warnings.push({ code: 'invalid_number', field: 'service.total', value: v['service.total'] })
  }
  let mileage: number | null = null
  if (v['service.mileage']) {
    mileage = parseInteger(v['service.mileage'], options.decimalSeparator)
    if (mileage == null)
      warnings.push({
        code: 'invalid_number',
        field: 'service.mileage',
        value: v['service.mileage'],
      })
  }
  const description = cleanText(v['service.description'])
  let title = cleanText(v['service.title'])
  if (!title && description)
    title = description.length > 80 ? `${description.slice(0, 77)}...` : description
  if (!title) errors.push({ code: 'service_title_required', field: 'service.title' })

  return {
    date,
    title,
    description,
    total,
    mileage,
    invoiceNumber: cleanText(v['service.invoiceNumber']),
    notes: cleanText(v['service.notes']),
    technician: cleanText(v['service.technician']),
  }
}

// ── Keys for matching ─────────────────────────────────────────────────────────

function customerKeys(c: CustomerDraft): {
  number: string | null
  email: string | null
  phone: string | null
  name: string | null
} {
  return {
    number: c.customerNumber?.toLowerCase() ?? null,
    email: c.email?.toLowerCase() ?? null,
    phone: phoneKey(c.phone),
    name: c.name?.toLowerCase() ?? null,
  }
}

/** One string that identifies the customer within the file. */
function customerFileKey(c: CustomerDraft): string | null {
  const k = customerKeys(c)
  return k.number
    ? `n:${k.number}`
    : k.email
      ? `e:${k.email}`
      : k.phone
        ? `p:${k.phone}`
        : k.name
          ? `m:${k.name}`
          : null
}

function vehicleFileKey(v: VehicleDraft, ownerKey: string | null): string | null {
  if (v.vin) return `v:${v.vin}`
  const p = plateKey(v.licensePlate)
  if (p) return `p:${p}`
  if (v.make && v.model && v.year)
    return `m:${v.make.toLowerCase()}|${v.model.toLowerCase()}|${v.year}|${ownerKey ?? ''}`
  return null
}

function vehicleLabel(v: {
  year: number
  make: string
  model: string
  licensePlate: string | null
}): string {
  const plate = v.licensePlate ? ` (${v.licensePlate})` : ''
  return `${v.year} ${v.make} ${v.model}${plate}`
}

class ExistingIndex {
  private byNumber = new Map<string, ExistingCustomer>()
  private byEmail = new Map<string, ExistingCustomer>()
  private byPhone = new Map<string, ExistingCustomer>()
  private byName = new Map<string, ExistingCustomer>()
  private byVin = new Map<string, ExistingVehicle>()
  private byPlate = new Map<string, ExistingVehicle>()
  private byMmy = new Map<string, ExistingVehicle>()
  readonly invoiceNumbers: Set<string>

  constructor(existing: ExistingData) {
    for (const c of existing.customers) {
      if (c.customerNumber) this.byNumber.set(c.customerNumber.toLowerCase(), c)
      if (c.email) this.byEmail.set(c.email.toLowerCase(), c)
      const p = phoneKey(c.phone)
      if (p) this.byPhone.set(p, c)
      if (!this.byName.has(c.name.toLowerCase())) this.byName.set(c.name.toLowerCase(), c)
    }
    for (const v of existing.vehicles) {
      const vin = normalizeVin(v.vin).value
      if (vin) this.byVin.set(vin, v)
      const p = plateKey(v.licensePlate)
      if (p) this.byPlate.set(p, v)
      this.byMmy.set(
        `${v.make.toLowerCase()}|${v.model.toLowerCase()}|${v.year}|${v.customerId ?? ''}`,
        v
      )
    }
    this.invoiceNumbers = new Set(existing.invoiceNumbers.map((n) => n.toLowerCase()))
  }

  customer(c: CustomerDraft): CustomerMatch | undefined {
    const k = customerKeys(c)
    const hit = (found: ExistingCustomer | undefined, on: CustomerMatch['on']) =>
      found ? { id: found.id, name: found.name, on } : undefined
    if (k.number) {
      const m = hit(this.byNumber.get(k.number), 'number')
      if (m) return m
    }
    if (k.email) {
      const m = hit(this.byEmail.get(k.email), 'email')
      if (m) return m
    }
    if (k.phone) {
      const m = hit(this.byPhone.get(k.phone), 'phone')
      if (m) return m
    }
    if (k.name) {
      const found = this.byName.get(k.name)
      // A name alone is only a match when nothing contradicts it.
      if (found) {
        const emailClash = k.email && found.email && found.email.toLowerCase() !== k.email
        const phoneClash = k.phone && found.phone && phoneKey(found.phone) !== k.phone
        if (!emailClash && !phoneClash) return hit(found, 'name')
      }
    }
    return undefined
  }

  vehicle(v: VehicleDraft, customerId: string | null): VehicleMatch | undefined {
    const hit = (found: ExistingVehicle | undefined, on: VehicleMatch['on']) =>
      found ? { id: found.id, label: vehicleLabel(found), on } : undefined
    if (v.vin) {
      const m = hit(this.byVin.get(v.vin), 'vin')
      if (m) return m
    }
    const p = plateKey(v.licensePlate)
    if (p) {
      const m = hit(this.byPlate.get(p), 'plate')
      if (m) return m
    }
    if (v.make && v.model && v.year) {
      const m = hit(
        this.byMmy.get(
          `${v.make.toLowerCase()}|${v.model.toLowerCase()}|${v.year}|${customerId ?? ''}`
        ),
        'makeModelYear'
      )
      if (m) return m
    }
    return undefined
  }
}

// ── Planning ──────────────────────────────────────────────────────────────────

export function planImport(
  rows: readonly string[][],
  mapping: ColumnMapping,
  options: ImportOptions,
  existing: ExistingData,
  overrides: RowOverrides = {}
): ImportPlan {
  const index = new ExistingIndex(existing)
  const { entity } = options
  const plans: RowPlan[] = []

  // Rows seen earlier in this file, so the same customer or vehicle in ten
  // rows is created once.
  const seenCustomers = new Map<string, number>()
  const seenVehicles = new Map<string, number>()
  const seenInvoiceNumbers = new Set<string>()

  rows.forEach((row, i) => {
    const v = valuesOf(row, mapping)
    const errors: RowIssue[] = []
    const warnings: RowIssue[] = []
    const plan: RowPlan = {
      index: i,
      action: 'create',
      errors,
      warnings,
      createsCustomer: false,
      createsVehicle: false,
    }

    // Customer part: required for a customer import, optional owner otherwise.
    const wantsCustomer = entity === 'customers' || hasGroup(v, 'customer')
    if (wantsCustomer) {
      const customer = extractCustomer(v, options, errors, warnings)
      const identifiable = Boolean(
        customer.name || customer.email || customer.phone || customer.customerNumber
      )
      if (entity === 'customers') {
        if (!customer.name) errors.push({ code: 'customer_name_required', field: 'customer.name' })
        plan.customer = customer
      } else if (identifiable) {
        // An owner given only by email or phone can still be linked to an
        // existing customer; it just cannot be created. An empty owner
        // column is simply no owner.
        plan.customer = customer
      }
    }

    // Vehicle part
    const wantsVehicle = entity !== 'customers' && (entity === 'vehicles' || hasGroup(v, 'vehicle'))
    if (wantsVehicle) {
      const vehicle = extractVehicle(v, options, errors, warnings)
      const identified = Boolean(
        vehicle.vin || vehicle.licensePlate || (vehicle.make && vehicle.model)
      )
      if (entity === 'vehicles') {
        if (!vehicle.make || !vehicle.model)
          errors.push({ code: 'vehicle_make_model_required', field: 'vehicle.make' })
        if (vehicle.year == null && !errors.some((e) => e.code === 'vehicle_year_invalid')) {
          errors.push({ code: 'vehicle_year_required', field: 'vehicle.year' })
        }
      } else if (!identified) {
        errors.push({ code: 'vehicle_identifier_required', field: 'vehicle.licensePlate' })
      }
      plan.vehicle = vehicle
    } else if (entity === 'services') {
      errors.push({ code: 'vehicle_identifier_required', field: 'vehicle.licensePlate' })
    }

    // Service part
    if (entity === 'services') {
      const service = extractService(v, options, errors, warnings)
      plan.service = service
      if (service.invoiceNumber) {
        const key = service.invoiceNumber.toLowerCase()
        if (index.invoiceNumbers.has(key) || seenInvoiceNumbers.has(key)) {
          errors.push({
            code: 'duplicate_invoice_number',
            field: 'service.invoiceNumber',
            value: service.invoiceNumber,
          })
        } else {
          seenInvoiceNumbers.add(key)
        }
      }
    }

    // Matching
    let customerId: string | null = null
    if (plan.customer) {
      const match = index.customer(plan.customer)
      if (match) {
        plan.customerMatch = match
        customerId = match.id
      } else {
        const key = customerFileKey(plan.customer)
        if (key && seenCustomers.has(key)) plan.customerSameAs = seenCustomers.get(key)
        else if (key) seenCustomers.set(key, i)
      }
    }
    if (plan.vehicle) {
      const match = index.vehicle(plan.vehicle, customerId)
      if (match) {
        plan.vehicleMatch = match
      } else {
        const ownerKey = plan.customer ? customerFileKey(plan.customer) : null
        const key = vehicleFileKey(plan.vehicle, ownerKey)
        if (key && seenVehicles.has(key)) plan.vehicleSameAs = seenVehicles.get(key)
        else if (key) seenVehicles.set(key, i)
      }
      // A service row whose car does not exist and cannot be created has nowhere to go.
      if (
        entity === 'services' &&
        !match &&
        !(plan.vehicle.make && plan.vehicle.model && plan.vehicle.year != null)
      ) {
        errors.push({
          code: 'vehicle_not_found',
          field: 'vehicle.licensePlate',
          value: plan.vehicle.licensePlate ?? plan.vehicle.vin ?? undefined,
        })
      }
    }

    // Decision
    if (errors.length) {
      plan.action = 'error'
    } else {
      const primaryMatched =
        entity === 'customers'
          ? Boolean(plan.customerMatch)
          : entity === 'vehicles'
            ? Boolean(plan.vehicleMatch)
            : false
      const override = overrides[String(i)]
      if (override && override !== 'error') {
        plan.action = override
      } else if (primaryMatched) {
        plan.action = options.duplicates === 'create' ? 'create' : options.duplicates
      } else {
        plan.action = 'create'
      }
      // "Create anyway" on a matched row means: forget the match.
      if (plan.action === 'create') {
        if (entity === 'customers') plan.customerMatch = undefined
        if (entity === 'vehicles') plan.vehicleMatch = undefined
      }
    }

    if (plan.action === 'create' || plan.action === 'update') {
      plan.createsCustomer = Boolean(
        plan.customer?.name && !plan.customerMatch && plan.customerSameAs == null
      )
      plan.createsVehicle = Boolean(
        plan.vehicle && !plan.vehicleMatch && plan.vehicleSameAs == null
      )
    }

    plans.push(plan)
  })

  // A row that shares its customer with an earlier row that ended up skipped
  // or in error still needs that customer; hand creation to the first row
  // that actually runs.
  const promoted = new Map<number, number>()
  for (const plan of plans) {
    if (plan.action !== 'create' && plan.action !== 'update') continue
    for (const kind of ['customer', 'vehicle'] as const) {
      const sameAs = kind === 'customer' ? plan.customerSameAs : plan.vehicleSameAs
      if (sameAs == null) continue
      const origin = plans[sameAs]
      const originRuns = origin.action === 'create' || origin.action === 'update'
      if (originRuns) continue
      const key = sameAs * 2 + (kind === 'customer' ? 0 : 1)
      const replacement = promoted.get(key)
      if (replacement == null) {
        promoted.set(key, plan.index)
        if (kind === 'customer') {
          plan.customerSameAs = undefined
          plan.createsCustomer = true
        } else {
          plan.vehicleSameAs = undefined
          plan.createsVehicle = true
        }
      } else if (kind === 'customer') plan.customerSameAs = replacement
      else plan.vehicleSameAs = replacement
    }
  }

  const summary: PlanSummary = {
    total: plans.length,
    create: 0,
    update: 0,
    skip: 0,
    error: 0,
    customersToCreate: 0,
    customersToUpdate: 0,
    vehiclesToCreate: 0,
    vehiclesToUpdate: 0,
    servicesToCreate: 0,
  }
  for (const plan of plans) {
    summary[plan.action]++
    if (plan.action === 'skip' || plan.action === 'error') continue
    if (plan.createsCustomer) summary.customersToCreate++
    if (plan.createsVehicle) summary.vehiclesToCreate++
    if (entity === 'customers' && plan.action === 'update') summary.customersToUpdate++
    if (entity === 'vehicles' && plan.action === 'update') summary.vehiclesToUpdate++
    if (entity === 'services' && plan.action === 'create') summary.servicesToCreate++
  }

  return { rows: plans, summary }
}
