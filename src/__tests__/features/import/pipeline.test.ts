import { describe, expect, it } from 'vitest'
import { type ExistingData, type ImportOptions, planImport } from '@/features/import/Lib/pipeline'

const options = (
  entity: ImportOptions['entity'],
  extra: Partial<ImportOptions> = {}
): ImportOptions => ({
  entity,
  dateFormat: 'auto',
  decimalSeparator: 'auto',
  defaultCountryCode: '+47',
  duplicates: 'update',
  ...extra,
})

const nothing: ExistingData = { customers: [], vehicles: [], invoiceNumbers: [] }

const existing: ExistingData = {
  customers: [
    {
      id: 'c1',
      name: 'Anna Berg',
      customerNumber: '1001',
      email: 'anna@example.com',
      phone: '+4791234567',
    },
    { id: 'c2', name: 'Ola Nordmann', customerNumber: '1002', email: null, phone: null },
  ],
  vehicles: [
    {
      id: 'v1',
      make: 'Toyota',
      model: 'Corolla',
      year: 2018,
      vin: 'JTDBR32E720012345',
      licensePlate: 'AB 12345',
      customerId: 'c1',
    },
  ],
  invoiceNumbers: ['INV-1001'],
}

/**
 * The plan is the dry run and the commit in one: what it says will happen is
 * what happens. These tests pin the decisions that matter to a shop moving
 * its data across: matching, sharing, ordering and refusing.
 */
describe('import plan', () => {
  it('creates customers and normalises what it can', () => {
    const plan = planImport(
      [['Anna', 'Berg', 'ANNA@Example.com', '912 34 567', 'Storgata 1', '0155', 'Oslo']],
      {
        '0': 'customer.firstName',
        '1': 'customer.lastName',
        '2': 'customer.email',
        '3': 'customer.phone',
        '4': 'customer.street',
        '5': 'customer.postalCode',
        '6': 'customer.city',
      },
      options('customers'),
      nothing
    )
    expect(plan.summary).toMatchObject({ total: 1, create: 1, error: 0, customersToCreate: 1 })
    expect(plan.rows[0].customer).toMatchObject({
      name: 'Anna Berg',
      email: 'anna@example.com',
      phone: '+4791234567',
      address: 'Storgata 1, 0155 Oslo',
    })
  })

  it('matches existing customers by number, email, phone, then name', () => {
    const rows = [
      ['Someone Else', '', '', '1001'],
      ['Someone Else', 'anna@example.com', '', ''],
      ['Someone Else', '', '91234567', ''],
      ['ola nordmann', '', '', ''],
      ['Anna Berg', 'other@example.com', '', ''],
    ]
    const plan = planImport(
      rows,
      {
        '0': 'customer.name',
        '1': 'customer.email',
        '2': 'customer.phone',
        '3': 'customer.customerNumber',
      },
      options('customers'),
      existing
    )
    expect(plan.rows.map((r) => r.customerMatch?.on)).toEqual([
      'number',
      'email',
      'phone',
      'name',
      undefined,
    ])
    expect(plan.rows.map((r) => r.action)).toEqual([
      'update',
      'update',
      'update',
      'update',
      'create',
    ])
  })

  it('applies the duplicate rule and per-row overrides', () => {
    const rows = [
      ['Anna Berg', 'anna@example.com'],
      ['Ola Nordmann', ''],
    ]
    const mapping = { '0': 'customer.name', '1': 'customer.email' }
    expect(
      planImport(rows, mapping, options('customers', { duplicates: 'skip' }), existing).summary.skip
    ).toBe(2)
    expect(
      planImport(rows, mapping, options('customers', { duplicates: 'create' }), existing).summary
        .create
    ).toBe(2)
    const plan = planImport(rows, mapping, options('customers'), existing, { '1': 'skip' })
    expect(plan.rows.map((r) => r.action)).toEqual(['update', 'skip'])
  })

  it('refuses rows that cannot be imported and says why', () => {
    const plan = planImport(
      [
        ['', 'anna@example.com'],
        ['Anna', 'not-an-email'],
      ],
      { '0': 'customer.name', '1': 'customer.email' },
      options('customers'),
      nothing
    )
    expect(plan.rows[0].action).toBe('error')
    expect(plan.rows[0].errors[0].code).toBe('customer_name_required')
    expect(plan.rows[1].action).toBe('create')
    expect(plan.rows[1].warnings[0].code).toBe('invalid_email')
    expect(plan.rows[1].customer?.email).toBeNull()
  })

  it('creates a vehicle once when it appears on several rows, and its owner once', () => {
    const rows = [
      ['Toyota', 'Corolla', '2018', 'CD 99999', 'Kari Hansen', 'kari@example.com'],
      ['Toyota', 'Corolla', '2018', 'cd-99999', 'Kari Hansen', 'kari@example.com'],
      ['Volvo', 'V70', '2012', 'EF 11111', 'Kari Hansen', 'kari@example.com'],
    ]
    const plan = planImport(
      rows,
      {
        '0': 'vehicle.make',
        '1': 'vehicle.model',
        '2': 'vehicle.year',
        '3': 'vehicle.licensePlate',
        '4': 'customer.name',
        '5': 'customer.email',
      },
      options('vehicles'),
      nothing
    )
    expect(plan.summary).toMatchObject({ vehiclesToCreate: 2, customersToCreate: 1 })
    expect(plan.rows[1].vehicleSameAs).toBe(0)
    expect(plan.rows[1].customerSameAs).toBe(0)
    expect(plan.rows[2].customerSameAs).toBe(0)
    expect(plan.rows[2].createsVehicle).toBe(true)
  })

  it('links a vehicle row to its existing owner and matches the vehicle by VIN or plate', () => {
    const plan = planImport(
      [
        ['Toyota', 'Corolla', '2018', 'ab12345', '', 'anna@example.com'],
        ['Toyota', 'Corolla', '2018', '', 'jtdbr32e720012345', ''],
      ],
      {
        '0': 'vehicle.make',
        '1': 'vehicle.model',
        '2': 'vehicle.year',
        '3': 'vehicle.licensePlate',
        '4': 'vehicle.vin',
        '5': 'customer.email',
      },
      options('vehicles'),
      existing
    )
    expect(plan.rows[0].vehicleMatch?.on).toBe('plate')
    expect(plan.rows[0].customerMatch?.id).toBe('c1')
    expect(plan.rows[1].vehicleMatch?.on).toBe('vin')
    expect(plan.rows.map((r) => r.action)).toEqual(['update', 'update'])
  })

  it('requires make, model and year for a new vehicle but accepts a single vehicle column', () => {
    const plan = planImport(
      [['2018 Toyota Corolla'], ['Toyota Corolla'], ['']],
      { '0': 'vehicle.description' },
      options('vehicles'),
      nothing
    )
    expect(plan.rows[0].action).toBe('create')
    expect(plan.rows[0].vehicle).toMatchObject({ year: 2018, make: 'Toyota', model: 'Corolla' })
    expect(plan.rows[1].errors[0].code).toBe('vehicle_year_required')
    expect(plan.rows[2].errors.map((e) => e.code)).toContain('vehicle_make_model_required')
  })

  it('imports service history against existing vehicles and refuses what it cannot place', () => {
    const rows = [
      ['15.03.2024', 'AB 12345', 'Oil change', '1.890,50', '84500', 'INV-2001'],
      ['15.03.2024', 'ZZ 00000', 'Unknown car', '100', '', ''],
      ['15.03.2024', 'AB 12345', 'Duplicate', '100', '', 'INV-1001'],
      ['not a date', 'AB 12345', 'Bad date', '100', '', ''],
    ]
    const plan = planImport(
      rows,
      {
        '0': 'service.date',
        '1': 'vehicle.licensePlate',
        '2': 'service.title',
        '3': 'service.total',
        '4': 'service.mileage',
        '5': 'service.invoiceNumber',
      },
      options('services'),
      existing
    )
    expect(plan.rows[0].action).toBe('create')
    expect(plan.rows[0].vehicleMatch?.id).toBe('v1')
    expect(plan.rows[0].service).toMatchObject({
      total: 1890.5,
      mileage: 84500,
      invoiceNumber: 'INV-2001',
    })
    expect(plan.rows[0].service?.date?.slice(0, 10)).toBe('2024-03-15')
    expect(plan.rows[1].errors[0].code).toBe('vehicle_not_found')
    expect(plan.rows[2].errors[0].code).toBe('duplicate_invoice_number')
    expect(plan.rows[3].errors[0].code).toBe('service_date_invalid')
    expect(plan.summary).toMatchObject({ create: 1, error: 3, servicesToCreate: 1 })
  })

  it('creates the vehicle for a history row when the row describes it', () => {
    const plan = planImport(
      [['2024-03-15', 'GH 22222', 'Volvo', 'V60', '2016', 'Service', 'Kari Hansen']],
      {
        '0': 'service.date',
        '1': 'vehicle.licensePlate',
        '2': 'vehicle.make',
        '3': 'vehicle.model',
        '4': 'vehicle.year',
        '5': 'service.title',
        '6': 'customer.name',
      },
      options('services'),
      existing
    )
    expect(plan.rows[0].action).toBe('create')
    expect(plan.rows[0].createsVehicle).toBe(true)
    expect(plan.rows[0].createsCustomer).toBe(true)
    expect(plan.summary).toMatchObject({
      vehiclesToCreate: 1,
      customersToCreate: 1,
      servicesToCreate: 1,
    })
  })

  it('hands shared-customer creation to the first row that actually runs', () => {
    // Row 0 is skipped by override; row 1 shares its customer and must now create it.
    const plan = planImport(
      [
        ['Toyota', 'Corolla', '2018', 'Kari Hansen'],
        ['Volvo', 'V70', '2012', 'Kari Hansen'],
        ['Saab', '9-3', '2008', 'Kari Hansen'],
      ],
      { '0': 'vehicle.make', '1': 'vehicle.model', '2': 'vehicle.year', '3': 'customer.name' },
      options('vehicles'),
      nothing,
      { '0': 'skip' }
    )
    expect(plan.rows[0].action).toBe('skip')
    expect(plan.rows[1].createsCustomer).toBe(true)
    expect(plan.rows[1].customerSameAs).toBeUndefined()
    expect(plan.rows[2].customerSameAs).toBe(1)
    expect(plan.summary.customersToCreate).toBe(1)
  })

  it('ignores mapped columns that are empty on a row and unmapped columns entirely', () => {
    const plan = planImport(
      [['Anna Berg', '', 'ignored']],
      { '0': 'customer.name', '1': 'customer.email' },
      options('customers'),
      nothing
    )
    expect(plan.rows[0].customer?.email).toBeNull()
    expect(plan.rows[0].warnings).toHaveLength(0)
  })
})
