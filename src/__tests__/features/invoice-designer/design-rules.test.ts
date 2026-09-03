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
  it('splits parts-only sales from vehicle jobs on the vehicle alone', () => {
    expect(designRuleMatches('parts_sale', partsSale)).toBe(true)
    expect(designRuleMatches('parts_sale', vehicleJob)).toBe(false)
    expect(designRuleMatches('vehicle_job', vehicleJob)).toBe(true)
    expect(designRuleMatches('vehicle_job', partsSale)).toBe(false)
  })
})

describe('pickDesignByRule', () => {
  const sale = { id: 'sale', autoRule: 'parts_sale' }
  const job = { id: 'job', autoRule: 'vehicle_job' }
  const plain = { id: 'plain', autoRule: null }

  it('picks the design for the kind of job', () => {
    expect(pickDesignByRule([job, sale, plain], partsSale)).toBe(sale)
    expect(pickDesignByRule([job, sale, plain], vehicleJob)).toBe(job)
  })

  it('returns null when no design volunteers for this kind', () => {
    expect(pickDesignByRule([sale, plain], vehicleJob)).toBeNull()
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
