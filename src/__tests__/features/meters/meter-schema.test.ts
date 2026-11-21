/**
 * @vitest-environment node
 *
 * What the meter and vehicle actions accept as input, before anything is
 * written: a reading date that is a real day, and a fleet number refused in
 * the person's own language.
 */
import { describe, expect, it, vi } from 'vitest'
import { addMeterReadingSchema } from '@/features/meters/Schema/meterSchema'

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string, values?: Record<string, number>) =>
    `${namespace}.${key}:${values?.max}`,
}))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { userId: string; organizationId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ userId: 'u', organizationId: 'o' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('@/lib/db', () => ({ db: {} }))

describe('a reading date', () => {
  const parse = (readOn: string) =>
    addMeterReadingSchema.safeParse({ vehicleMeterId: 'vm', value: '1', readOn }).success

  it('is a day that exists', () => {
    expect(parse('2026-11-19')).toBe(true)
    expect(parse('2028-02-29')).toBe(true)
    expect(parse('')).toBe(true)
  })

  it('is refused when it would roll over into another day', () => {
    expect(parse('2026-13-45')).toBe(false)
    expect(parse('2026-02-30')).toBe(false)
    expect(parse('2027-02-29')).toBe(false)
  })
})

describe('a fleet number over the limit', () => {
  it('is refused by the actions in the person’s language, before anything is read', async () => {
    const { createVehicle, updateVehicle } = await import(
      '@/features/vehicles/Actions/vehicleActions'
    )
    const long = 'T'.repeat(41)
    expect(
      await createVehicle({ make: 'Volvo', model: 'FH', year: 2019, fleetNumber: long })
    ).toEqual({
      success: false,
      error: 'vehicles.form.fleetNumberTooLong:40',
    })
    expect(await updateVehicle({ id: 'v', fleetNumber: long })).toEqual({
      success: false,
      error: 'vehicles.form.fleetNumberTooLong:40',
    })
  })
})
