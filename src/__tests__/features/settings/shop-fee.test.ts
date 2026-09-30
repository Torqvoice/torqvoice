import { describe, it, expect } from 'vitest'
import {
  documentLaborLines,
  newShopFeeLine,
  readShopFee,
  recalculateShopFeeLines,
  shopFeeAmount,
  shopFeeFor,
  shopFeeLinesLast,
  type ShopFeeConfig,
} from '@/features/settings/Lib/shopFee'
import { addedLaborLines } from '@/features/vehicles/Lib/laborLines'
import type { ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'

const percent = (over: Partial<ShopFeeConfig> = {}): ShopFeeConfig => ({
  label: 'Shop supplies',
  mode: 'percent',
  amount: 0,
  percent: 10,
  base: 'labor',
  cap: null,
  appliesTo: 'both',
  ...over,
})

describe('reading the shop fee settings', () => {
  it('is off unless switched on', () => {
    expect(readShopFee({ 'invoice.shopFeeAmount': '10' })).toBeNull()
  })

  it('treats a fee of nothing as no fee', () => {
    expect(
      readShopFee({ 'invoice.shopFeeEnabled': 'true', 'invoice.shopFeeMode': 'flat' })
    ).toBeNull()
  })

  it('reads a percentage fee with its base and cap', () => {
    expect(
      readShopFee({
        'invoice.shopFeeEnabled': 'true',
        'invoice.shopFeeMode': 'percent',
        'invoice.shopFeePercent': '8',
        'invoice.shopFeeBase': 'laborParts',
        'invoice.shopFeeCap': '40',
        'invoice.shopFeeLabel': 'Supplies',
      })
    ).toEqual({
      label: 'Supplies',
      mode: 'percent',
      amount: 0,
      percent: 8,
      base: 'laborParts',
      cap: 40,
      appliesTo: 'both',
    })
  })

  it('is written onto both kinds of document unless told otherwise', () => {
    expect(shopFeeFor(percent(), 'quote')).not.toBeNull()
    expect(shopFeeFor(percent({ appliesTo: 'workOrders' }), 'quote')).toBeNull()
    expect(shopFeeFor(percent({ appliesTo: 'workOrders' }), 'workOrder')).not.toBeNull()
    expect(shopFeeFor(percent({ appliesTo: 'quotes' }), 'workOrder')).toBeNull()
    expect(shopFeeFor(null, 'quote')).toBeNull()
  })
})

describe('the fee on a job', () => {
  it('is a percentage of labour, or of labour and parts', () => {
    expect(shopFeeAmount(percent(), { labor: 300, parts: 200 })).toBe(30)
    expect(shopFeeAmount(percent({ base: 'laborParts' }), { labor: 300, parts: 200 })).toBe(50)
  })

  it('never comes to more than the cap', () => {
    expect(shopFeeAmount(percent({ cap: 25 }), { labor: 1000, parts: 0 })).toBe(25)
  })

  it('is the flat amount whatever the job holds', () => {
    const flat = percent({ mode: 'flat', amount: 15 })
    expect(shopFeeAmount(flat, { labor: 1000, parts: 500 })).toBe(15)
    expect(newShopFeeLine(flat)).toEqual({
      description: 'Shop supplies',
      hours: 1,
      rate: 15,
      total: 15,
      pricingType: 'shopFee',
    })
  })
})

describe('keeping a percentage fee in step with the job', () => {
  const lines = [
    { description: 'Brakes', pricingType: 'hourly', hours: 2, rate: 100, total: 200 },
    { description: 'Shop supplies', pricingType: 'shopFee', hours: 1, rate: 0, total: 0 },
  ]

  it('re-prices the fee from the other lines, never from itself', () => {
    const next = recalculateShopFeeLines(lines, 0, percent())
    expect(next[1].total).toBe(20)
    expect(recalculateShopFeeLines(next, 0, percent())).toBe(next)
  })

  it('leaves a flat fee alone, so a price typed on the job stays', () => {
    const typed = [lines[0], { ...lines[1], rate: 7, total: 7 }]
    expect(recalculateShopFeeLines(typed, 0, percent({ mode: 'flat', amount: 15 }))).toBe(typed)
  })

  it('does not charge on quote lines the customer left out', () => {
    const quote = [{ ...lines[0], excluded: true }, lines[1]]
    expect(recalculateShopFeeLines(quote, 0, percent())[1].total).toBe(0)
  })
})

describe('the fee on the job and on the document', () => {
  const fee = (total: number): ServiceLaborInput => ({
    description: 'Shop supplies',
    pricingType: 'shopFee',
    hours: 1,
    rate: total,
    total,
  })
  const brakes: ServiceLaborInput = {
    description: 'Brakes',
    pricingType: 'hourly',
    hours: 2,
    rate: 100,
    total: 200,
  }
  const diag: ServiceLaborInput = {
    description: 'Diagnosis',
    pricingType: 'hourly',
    hours: 1,
    rate: 100,
    total: 100,
  }

  it('is never a line a technician added, even re-priced', () => {
    // The desk is mid-edit, the phone adds a line, the server re-prices the
    // percentage fee. Only the technician's line is new.
    expect(addedLaborLines([fee(20), brakes], [fee(30), brakes, diag])).toEqual([diag])
  })

  it('goes last on the job, wherever it was', () => {
    const lines = [fee(20), brakes, diag]
    expect(shopFeeLinesLast(lines)).toEqual([brakes, diag, fee(20)])
    const ordered = [brakes, fee(20)]
    expect(shopFeeLinesLast(ordered)).toBe(ordered)
  })

  it('prints last, and not at all when it came to nothing', () => {
    expect(documentLaborLines([fee(0), brakes])).toEqual([brakes])
    expect(documentLaborLines([fee(20), brakes])).toEqual([brakes, fee(20)])
  })
})
