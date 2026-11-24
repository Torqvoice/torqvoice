/**
 * What the server refuses whatever the page sends: a reading below zero, a
 * priced part billed none of, quantities, prices and texts past anything a
 * workshop writes. A tab opened before this change, or a script, gets an
 * error and nothing is written. And a line total is held to the cent.
 */
import { describe, expect, it } from 'vitest'
import { createCustomerSchema } from '@/features/customers/Schema/customerSchema'
import { createLaborPresetSchema } from '@/features/labor-presets/Schema/laborPresetSchema'
import { createVehicleSchema, updateVehicleSchema } from '@/features/vehicles/Schema/vehicleSchema'
import {
  serviceLaborSchema,
  servicePartSchema,
  updateServiceSchema,
} from '@/features/vehicles/Schema/serviceSchema'

const part = { name: 'Brake pads', quantity: 1, unitPrice: 100, total: 100 }

describe('a work order', () => {
  it('refuses a negative reading and takes an empty one', () => {
    expect(updateServiceSchema.safeParse({ id: 'j1', mileage: -5 }).success).toBe(false)
    expect(updateServiceSchema.safeParse({ id: 'j1', mileage: null }).success).toBe(true)
    expect(updateServiceSchema.safeParse({ id: 'j1', mileage: 120_500 }).success).toBe(true)
    expect(updateServiceSchema.safeParse({ id: 'j1', mileage: 10_000_001 }).success).toBe(false)
  })

  it('refuses a priced part with no quantity, and keeps a free one', () => {
    const zero = servicePartSchema.safeParse({ ...part, quantity: 0, total: 0 })
    expect(zero.success).toBe(false)
    expect(zero.error?.issues[0].path).toEqual(['quantity'])
    expect(
      servicePartSchema.safeParse({ ...part, quantity: 0, unitPrice: 0, total: 0 }).success
    ).toBe(true)
  })

  it('refuses a billion parts at a hundred million each', () => {
    expect(
      servicePartSchema.safeParse({
        ...part,
        quantity: 1_000_000_000,
        unitPrice: 99_999_999,
        total: 119_999_998_800_000_000,
      }).success
    ).toBe(false)
    expect(servicePartSchema.safeParse({ ...part, quantity: 100_001 }).success).toBe(false)
    expect(servicePartSchema.safeParse({ ...part, unitPrice: 10_000_001 }).success).toBe(false)
    expect(
      servicePartSchema.safeParse({ ...part, quantity: 100_000, unitPrice: 10, total: 1_000_000 })
        .success
    ).toBe(true)
  })

  it('holds a line total to the cent', () => {
    expect(
      servicePartSchema.parse({ ...part, quantity: 3, unitPrice: 0.1, total: 0.30000000000000004 })
        .total
    ).toBe(0.3)
    expect(
      serviceLaborSchema.parse({
        description: 'Fit',
        hours: 2.5,
        rate: 19.99,
        total: 49.974999999999994,
      }).total
    ).toBe(49.98)
  })

  it('keeps a labour line with no hours yet, and refuses absurd ones', () => {
    expect(serviceLaborSchema.safeParse({ description: 'Diagnose', hours: 0 }).success).toBe(true)
    expect(serviceLaborSchema.safeParse({ description: 'Diagnose', hours: 100_001 }).success).toBe(
      false
    )
    expect(
      serviceLaborSchema.safeParse({ description: 'Diagnose', rate: 10_000_001 }).success
    ).toBe(false)
  })
})

describe('a vehicle', () => {
  const vehicle = { make: 'Volkswagen', model: 'Golf', year: 2018 }
  it('refuses a negative or absurd reading, on create and on edit', () => {
    expect(createVehicleSchema.safeParse({ ...vehicle, mileage: -5 }).success).toBe(false)
    expect(createVehicleSchema.safeParse({ ...vehicle, mileage: 10_000_001 }).success).toBe(false)
    expect(updateVehicleSchema.safeParse({ id: 'v1', mileage: -5 }).success).toBe(false)
  })

  it('refuses a make longer than a name gets', () => {
    expect(createVehicleSchema.safeParse({ ...vehicle, make: 'x'.repeat(201) }).success).toBe(false)
  })
})

describe('a customer', () => {
  it('refuses a name past 200 characters and an address past 500', () => {
    expect(createCustomerSchema.safeParse({ name: 'x'.repeat(480) }).success).toBe(false)
    expect(
      createCustomerSchema.safeParse({ name: 'ZZ Long', address: 'x'.repeat(3000) }).success
    ).toBe(false)
    expect(
      createCustomerSchema.safeParse({ name: 'x'.repeat(200), address: 'x'.repeat(500) }).success
    ).toBe(true)
  })

  it('leaves room for long notes', () => {
    expect(createCustomerSchema.safeParse({ name: 'ZZ', notes: 'x'.repeat(5000) }).success).toBe(
      true
    )
  })
})

describe('a labour preset', () => {
  it('refuses absurd hours and rates', () => {
    const item = { description: 'Oil change', hours: 1, rate: 100 }
    expect(createLaborPresetSchema.safeParse({ items: [item] }).success).toBe(true)
    expect(
      createLaborPresetSchema.safeParse({ items: [{ ...item, hours: 100_001 }] }).success
    ).toBe(false)
    expect(
      createLaborPresetSchema.safeParse({ items: [{ ...item, rate: 10_000_001 }] }).success
    ).toBe(false)
  })
})
