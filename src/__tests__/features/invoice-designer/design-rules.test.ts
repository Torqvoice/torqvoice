/**
 * When a design volunteers itself for an invoice. The rule reads only
 * whether a vehicle is attached, which is the same split the job picker
 * makes between a vehicle and a parts-only sale.
 */
import { describe, expect, it } from 'vitest'
import {
  designRuleMatches,
  isDesignAutoRule,
  pickDesignByRule,
} from '@/features/invoice-designer/Lib/designRules'

const partsSale = { hasVehicle: false }
const vehicleJob = { hasVehicle: true }

describe('designRuleMatches', () => {
  it('claims a sale without a vehicle and nothing else', () => {
    expect(designRuleMatches('parts_sale', partsSale)).toBe(true)
    expect(designRuleMatches('parts_sale', vehicleJob)).toBe(false)
  })
})

describe('pickDesignByRule', () => {
  const sale = { id: 'sale', autoRule: 'parts_sale' }
  const plain = { id: 'plain', autoRule: null }

  it('picks the sale design for a sale and leaves a vehicle job to the default', () => {
    expect(pickDesignByRule([plain, sale], partsSale)).toBe(sale)
    expect(pickDesignByRule([plain, sale], vehicleJob)).toBeNull()
  })

  it('never picks a design without a rule, or with one it does not know', () => {
    expect(pickDesignByRule([plain, { id: 'odd', autoRule: 'weekends' }], vehicleJob)).toBeNull()
  })
})

describe('isDesignAutoRule', () => {
  it('accepts the known rules and nothing else', () => {
    expect(isDesignAutoRule('parts_sale')).toBe(true)
    expect(isDesignAutoRule('parts_only')).toBe(false)
    expect(isDesignAutoRule(null)).toBe(false)
  })
})
