/**
 * @vitest-environment node
 *
 * The vehicle's fleet / unit number, and the workshop's own fields on
 * vehicles and customers, on paper. Both are opt-in, and most of what is
 * tested here is that half: a workshop that never asked for either gets the
 * documents, import columns and views it always got, to the byte.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FLEET_NUMBER_MAX_LENGTH,
  fleetNumberLine,
  fleetNumberTooLong,
  normalizeFleetNumber,
} from '@/features/vehicles/Lib/fleetNumber'
import {
  fleetNumberEnabledIn,
  fleetNumberMatch,
  gateFleetNumber,
} from '@/features/vehicles/Lib/fleetNumberSetting'
import {
  FLEET_NUMBER_COLUMNS,
  TABLE_COLUMNS,
  columnsFor,
} from '@/features/ai/tools/workshop-columns'
import { fieldsFor, templateFieldsFor } from '@/features/import/Lib/fields'
import { suggestMapping } from '@/features/import/Lib/suggest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { buildWorkOrderPrintSpec } from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import { sectionFields } from '@/features/invoice-designer/Spec/buildSpec'
import { SETTINGS_SEARCH_INDEX } from '@/features/settings/Lib/searchIndex'
import {
  DESIGNER_LAYOUT_VERSION,
  GRANDFATHERED_FIELDS,
  type InvoiceLayoutConfig,
  getDefaultInvoiceLayout,
  getDefaultLayout,
  isOptInField,
  mergeWithDefaults,
  toCustomFieldId,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import {
  buildLayoutFromPreset,
  layoutPresets,
  workOrderPresets,
} from '@/features/settings/Schema/layoutPresets'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { createVehicleSchema } from '@/features/vehicles/Schema/vehicleSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'
import { TECH_API_FEATURES } from '@/lib/tech-api-features'

const KEY = SETTING_KEYS.VEHICLE_FLEET_NUMBER_ENABLED

describe('what is stored for what was typed', () => {
  it('trims it, and keeps nothing for an emptied box', () => {
    expect(normalizeFleetNumber('  T-208 ')).toBe('T-208')
    expect(normalizeFleetNumber('   ')).toBeNull()
    expect(normalizeFleetNumber(undefined)).toBeNull()
  })

  it('never cuts a long value: it is refused or reported where it comes in', () => {
    expect(normalizeFleetNumber('x'.repeat(500))).toHaveLength(500)
    expect(fleetNumberTooLong('x'.repeat(FLEET_NUMBER_MAX_LENGTH))).toBe(false)
    expect(fleetNumberTooLong(` ${'x'.repeat(FLEET_NUMBER_MAX_LENGTH)} `)).toBe(false)
    expect(fleetNumberTooLong('x'.repeat(FLEET_NUMBER_MAX_LENGTH + 1))).toBe(true)
  })

  it('is refused by the action over the limit, with the limit in the reason', () => {
    const base = { make: 'Volvo', model: 'FH', year: 2019 }
    const long = createVehicleSchema.safeParse({ ...base, fleetNumber: 'x'.repeat(41) })
    expect(long.success).toBe(false)
    expect(long.error?.issues[0].message).toContain('40')
    expect(createVehicleSchema.safeParse({ ...base, fleetNumber: 'x'.repeat(40) }).success).toBe(
      true
    )
  })

  it('is reported on its row by an import, and left out rather than cut', async () => {
    const { planImport } = await import('@/features/import/Lib/pipeline')
    const long = 'Unit '.repeat(10)
    const plan = planImport(
      [['Volvo', 'FH', '2019', 'ZZ 208', long]],
      {
        '0': 'vehicle.make',
        '1': 'vehicle.model',
        '2': 'vehicle.year',
        '3': 'vehicle.licensePlate',
        '4': 'vehicle.fleetNumber',
      },
      {
        entity: 'vehicles',
        dateFormat: 'auto',
        decimalSeparator: 'auto',
        defaultCountryCode: '+47',
        duplicates: 'update',
      },
      { customers: [], vehicles: [], invoiceNumbers: [] }
    )
    const row = plan.rows[0]
    expect(row.warnings).toContainEqual(
      expect.objectContaining({ code: 'fleet_number_too_long', value: long })
    )
    expect(row.vehicle?.fleetNumber ?? null).toBeNull()
  })

  it('is a field an old tab does not have to send', () => {
    const base = { make: 'Volvo', model: 'FH', year: 2019 }
    expect(createVehicleSchema.safeParse(base).success).toBe(true)
    expect(createVehicleSchema.safeParse({ ...base, fleetNumber: 'T-208' }).success).toBe(true)
  })
})

describe('the switch', () => {
  const plan = { customFields: true }

  it('is off until a workshop turns it on', () => {
    expect(fleetNumberEnabledIn({}, plan)).toBe(false)
    expect(fleetNumberEnabledIn({ [KEY]: 'false' }, plan)).toBe(false)
    expect(fleetNumberEnabledIn({ [KEY]: '1' }, plan)).toBe(false)
    expect(fleetNumberEnabledIn({ [KEY]: 'true' }, plan)).toBe(true)
  })

  it('is off on a plan without custom fields, whatever the switch still says', () => {
    expect(fleetNumberEnabledIn({ [KEY]: 'true' }, { customFields: false })).toBe(false)
  })

  it('hides the number while it is off, and keeps the rest of the vehicle', () => {
    const vehicle = { id: 'v1', make: 'Volvo', fleetNumber: 'T-208' }
    expect(gateFleetNumber(vehicle, false)).toEqual({ id: 'v1', make: 'Volvo', fleetNumber: null })
    expect(gateFleetNumber(vehicle, true)).toBe(vehicle)
  })

  it('adds nothing to a search while it is off', () => {
    expect(fleetNumberMatch('T-208', false)).toEqual([])
    expect(fleetNumberMatch('  ', true)).toEqual([])
    expect(fleetNumberMatch('T-208', true)).toEqual([
      { fleetNumber: { contains: 'T-208', mode: 'insensitive' } },
    ])
  })

  it('is tied to the same plan in the settings search', () => {
    const entry = SETTINGS_SEARCH_INDEX.find((e) => e.id === 'invoice.fleetNumber')
    expect(entry?.requires).toBe('customFields')
  })
})

describe('the model’s view of vehicles', () => {
  it('has no fleet number column for a workshop that has it off', () => {
    const off = columnsFor('vehicles', { customerReference: true, fleetNumber: false })
    expect(off).toEqual(TABLE_COLUMNS.vehicles.filter((c) => !FLEET_NUMBER_COLUMNS.includes(c)))
    expect(off).not.toContain('fleetNumber')
    expect(columnsFor('vehicles', { customerReference: false, fleetNumber: true })).toContain(
      'fleetNumber'
    )
  })

  it('changes no other table', () => {
    for (const table of Object.keys(TABLE_COLUMNS).filter((t) => t !== 'vehicles')) {
      expect(columnsFor(table, { customerReference: true, fleetNumber: false }), table).toEqual([
        ...TABLE_COLUMNS[table],
      ])
    }
  })
})

describe('importing a spreadsheet', () => {
  const keys = (fleetNumber: boolean) => fieldsFor('vehicles', { fleetNumber }).map((f) => f.key)

  it('offers the column only to a workshop that uses the field', () => {
    expect(keys(false)).not.toContain('vehicle.fleetNumber')
    expect(keys(true)).toContain('vehicle.fleetNumber')
    expect(fieldsFor('vehicles').map((f) => f.key)).not.toContain('vehicle.fleetNumber')
  })

  it('never maps a "Unit number" column while the field is off', () => {
    const columns = ['Make', 'Model', 'Unit number']
    const rows = [['Volvo', 'FH', 'T-208']]
    const off = suggestMapping(columns, rows, 'vehicles', null, {})
    expect(Object.values(off.mapping)).not.toContain('vehicle.fleetNumber')
    const on = suggestMapping(columns, rows, 'vehicles', null, { fleetNumber: true })
    expect(on.mapping['2']).toBe('vehicle.fleetNumber')
  })

  it('leaves the downloadable templates as they were', () => {
    for (const entity of ['vehicles', 'services'] as const) {
      expect(templateFieldsFor(entity).map((f) => f.key)).not.toContain('vehicle.fleetNumber')
    }
  })
})

describe('the technician app', () => {
  it('is told the server sends the fleet number', () => {
    expect(TECH_API_FEATURES).toContain('vehicle-fleet-number')
    // Never renamed or removed: an installed app looks for the exact string.
    expect(TECH_API_FEATURES).toEqual(
      expect.arrayContaining(['job-video', 'checkin', 'job-documents', 'job-reference'])
    )
  })
})

const CF_VEHICLE = 'cfvehicle1'
const CF_CUSTOMER = 'cfcustomer1'
const recordCustomFields = [
  { fieldId: CF_VEHICLE, label: 'Tachograph due', value: 'TACHO-MARCH', fieldType: 'text' },
  { fieldId: CF_CUSTOMER, label: 'Cost centre', value: 'CC-7741', fieldType: 'text' },
]

const invoiceData = {
  id: 'svc1',
  title: 'Service',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-26'),
  invoiceDate: new Date('2026-09-26'),
  shopName: 'Shop',
  techName: null,
  mileage: null,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  invoiceNumber: 'INV-1',
  partItems: [],
  laborItems: [{ description: 'Work', hours: 1, rate: 100, total: 100 }],
  customer: { name: 'Alex Carter', email: null, phone: null, address: null, company: null },
  vehicle: {
    make: 'Volvo',
    model: 'FH',
    year: 2019,
    vin: null,
    licensePlate: 'AB 12345',
    mileage: 1000,
    fleetNumber: 'T-208',
    customer: null,
  },
  recordCustomFields,
} as unknown as InvoiceData

const bare = {
  ...invoiceData,
  vehicle: { ...invoiceData.vehicle, fleetNumber: null },
  recordCustomFields: [],
} as unknown as InvoiceData

const quoteOf = (data: InvoiceData) =>
  ({
    ...(data as unknown as Record<string, unknown>),
    quoteNumber: 'Q-1',
    status: 'draft',
    createdAt: new Date('2026-09-26'),
    validUntil: null,
    notes: null,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
  }) as never

const job = {
  orderNumber: '1',
  statusLabel: 'Open',
  concerns: [],
  printedAt: new Date('2026-09-26T00:00:00Z'),
} as never

const labels = { fleetNumber: 'Fleet no.' }
const LINE = 'Fleet no.: T-208'
const NEW = ['T-208', 'TACHO-MARCH', 'CC-7741', 'Tachograph due', 'Cost centre']

/** The layout as the designer saves it with the new lines switched on in the vehicle block. */
function withNewLinesOn(layout: InvoiceLayoutConfig): InvoiceLayoutConfig {
  return {
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections.map((section) =>
      section.id === 'vehicle'
        ? {
            ...section,
            visible: true,
            fields: [
              ...(section.fields ?? []).map((field) =>
                field.id === 'fleet_number' ? { ...field, visible: true } : field
              ),
              { id: toCustomFieldId(CF_VEHICLE), visible: true },
              { id: toCustomFieldId(CF_CUSTOMER), visible: true },
            ],
          }
        : section
    ),
  }
}

const invoiceSpec = (layoutConfig: InvoiceLayoutConfig, data: InvoiceData = invoiceData) =>
  JSON.stringify(buildInvoicePrintSpec({ data, labels, template: { layoutConfig } as never }))
const quoteSpec = (layoutConfig: InvoiceLayoutConfig, data: InvoiceData = invoiceData) =>
  JSON.stringify(
    buildQuotePrintSpec({
      data: quoteOf(data),
      labels,
      layoutConfig,
      recordCustomFields: data.recordCustomFields,
    })
  )
const workOrderSpec = (layoutConfig: InvoiceLayoutConfig, data: InvoiceData = invoiceData) =>
  JSON.stringify(
    buildWorkOrderPrintSpec({ data, job, labels, template: { layoutConfig } as never })
  )

describe('printing the fleet number and the vehicle’s and customer’s own fields', () => {
  it('reads "Fleet no.: T-208", and nothing for a vehicle without one', () => {
    expect(fleetNumberLine({ fleetNumber: ' T-208 ' }, 'Fleet no.')).toBe(LINE)
    expect(fleetNumberLine({ fleetNumber: null }, 'Fleet no.')).toBe('')
    expect(fleetNumberLine(null, 'Fleet no.')).toBe('')
  })

  it('is an opt-in field, never a grandfathered one', () => {
    expect(isOptInField('vehicle', 'fleet_number')).toBe(true)
    expect(Object.values(GRANDFATHERED_FIELDS).flat()).not.toContain('fleet_number')
  })

  it('is off in every default layout', () => {
    for (const type of ['invoice', 'work_order', 'certificate'] as const) {
      const vehicle = getDefaultLayout(type).sections.find((s) => s.id === 'vehicle')
      const field = vehicle?.fields?.find((f) => f.id === 'fleet_number')
      if (vehicle?.fields) expect(field?.visible, type).toBe(false)
    }
  })

  it('print on no default sheet, though the vehicle and the customer carry them', () => {
    for (const text of NEW) {
      expect(invoiceSpec(getDefaultInvoiceLayout())).not.toContain(text)
      expect(quoteSpec(getDefaultInvoiceLayout())).not.toContain(text)
      expect(workOrderSpec(getDefaultLayout('work_order'))).not.toContain(text)
    }
  })

  it('print the same sheet with them as without, on every starting point a workshop can pick', () => {
    for (const layout of [getDefaultInvoiceLayout(), ...layoutPresets.map(buildLayoutFromPreset)]) {
      expect(invoiceSpec(layout)).toBe(invoiceSpec(layout, bare))
      expect(quoteSpec(layout)).toBe(quoteSpec(layout, bare))
    }
    for (const layout of [
      getDefaultLayout('work_order'),
      ...workOrderPresets.map(buildLayoutFromPreset),
    ]) {
      expect(workOrderSpec(layout)).toBe(workOrderSpec(layout, bare))
    }
  })

  it('stay off in a design saved before they existed', () => {
    for (const layout of [getDefaultInvoiceLayout(), getDefaultLayout('work_order')]) {
      const saved = {
        ...layout,
        version: DESIGNER_LAYOUT_VERSION,
        sections: layout.sections.map((s) =>
          s.id === 'vehicle'
            ? {
                ...s,
                visible: true,
                // Every vehicle line on, as an old design has them, and no
                // mention of the new one.
                fields: s.fields
                  ?.filter((f) => f.id !== 'fleet_number')
                  .map((f) => ({ ...f, visible: true })),
              }
            : s
        ),
      }
      const merged = mergeWithDefaults(saved)
      const vehicle = merged.sections.find((s) => s.id === 'vehicle')
      expect(vehicle?.fields?.find((f) => f.id === 'fleet_number')?.visible).toBe(false)
      expect(invoiceSpec(merged)).toBe(invoiceSpec(merged, bare))
    }
  })

  it('stay off in a vehicle block that never listed its fields at all', () => {
    const vehicle = getDefaultInvoiceLayout().sections.find((s) => s.id === 'vehicle')
    if (!vehicle) throw new Error('no vehicle section')
    const { fields: _fields, ...unlisted } = vehicle
    expect(sectionFields(unlisted)).not.toContain('fleet_number')
  })

  it('print on the invoice, the quote and the work order once a design places them', () => {
    const specs = [
      invoiceSpec(withNewLinesOn(getDefaultInvoiceLayout())),
      quoteSpec(withNewLinesOn(getDefaultInvoiceLayout())),
      workOrderSpec(withNewLinesOn(getDefaultLayout('work_order'))),
    ]
    for (const spec of specs) {
      expect(spec).toContain(LINE)
      expect(spec).toContain('Tachograph due: TACHO-MARCH')
      expect(spec).toContain('Cost centre: CC-7741')
    }
  })

  it('print nothing for a vehicle without them, rather than a caption', () => {
    const spec = invoiceSpec(withNewLinesOn(getDefaultInvoiceLayout()), bare)
    expect(spec).not.toContain('Fleet no.')
    expect(spec).not.toContain('Tachograph due')
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__' || name === 'generated' || name === 'node_modules') return []
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('pages that read the switch from a list of settings they chose', () => {
  it('have the switch on that list', () => {
    // A page that loads only named settings and then asks whether the field
    // is on gets "off" for ever if the switch is not one of the names.
    const offenders = sourceFiles('src')
      .filter((path) => !path.includes('vehicles/Lib/fleetNumberSetting'))
      .filter((path) => {
        const source = readFileSync(path, 'utf8')
        if (!source.includes('fleetNumberEnabledIn(')) return false
        const picksKeys = /appSetting\.findMany\(\{[\s\S]{0,200}?key:\s*\{\s*in:/.test(source)
        return picksKeys && !source.includes('SETTING_KEYS.VEHICLE_FLEET_NUMBER_ENABLED')
      })
    expect(offenders).toEqual([])
  })
})
