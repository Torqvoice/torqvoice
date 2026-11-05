import { describe, expect, it } from 'vitest'
import {
  extractFaultCodes,
  faultLine,
  findingLine,
  isManufacturerCode,
  looksLikeFaultCode,
  normalizeFaultCode,
} from '@/features/fault-codes/Lib/codes'
import { visiblePageCommands } from '@/features/search/Lib/commands'

/**
 * What a technician types or pastes from a scan tool has to come out as the
 * codes they meant, once each, with the status the tool printed beside them,
 * and nothing that only looks like a code.
 */
describe('reading codes out of pasted text', () => {
  it('turns "p0420, P0171 stored" into two codes, the second stored', () => {
    expect(extractFaultCodes('p0420, P0171 stored')).toEqual([
      { code: 'P0420' },
      { code: 'P0171', status: 'stored' },
    ])
  })

  it('reads a scan tool export line by line with its statuses', () => {
    const report = [
      'Engine control module',
      'P0300  Random/Multiple Cylinder Misfire Detected   Confirmed',
      'P0171  System Too Lean (Bank 1)                    Pending',
      'U0100:87 Lost Communication With ECM/PCM "A"      History',
      'B1A2F-00 Driver seat belt                          Permanent',
    ].join('\n')
    expect(extractFaultCodes(report)).toEqual([
      { code: 'P0300', status: 'stored' },
      { code: 'P0171', status: 'pending' },
      { code: 'U0100', status: 'history' },
      { code: 'B1A2F', status: 'permanent' },
    ])
  })

  it('lists a code once, keeping a status given the second time', () => {
    expect(extractFaultCodes('P0420 and again P0420 pending')).toEqual([
      { code: 'P0420', status: 'pending' },
    ])
  })

  it('leaves out what is not a code: a VIN, a part number, a fifth digit, a P4 code', () => {
    expect(extractFaultCodes('VIN WVWZZZ1KZP0420123, part 1K0P04201, P04201, P4000')).toEqual([])
  })

  it('does not read a status out of words a title uses', () => {
    expect(extractFaultCodes('P0562 System voltage low current draw past limit')).toEqual([
      { code: 'P0562' },
    ])
  })
})

describe('writing a code the one way it is stored', () => {
  it('normalises case, spaces and the failure-type byte', () => {
    expect(normalizeFaultCode(' p0420 ')).toBe('P0420')
    expect(normalizeFaultCode('p 0420')).toBe('P0420')
    expect(normalizeFaultCode('U0100:87')).toBe('U0100')
    expect(normalizeFaultCode('P0420-00')).toBe('P0420')
    expect(normalizeFaultCode('c1a2f')).toBe('C1A2F')
  })

  it('refuses anything that is not a code', () => {
    for (const text of ['', 'P042', 'P04200', 'X0420', 'P4420', 'banana', null, undefined]) {
      expect(normalizeFaultCode(text)).toBeNull()
    }
  })

  it('tells manufacturer ranges from the standard ones', () => {
    expect(isManufacturerCode('P1570')).toBe(true)
    expect(isManufacturerCode('P3001')).toBe(true)
    expect(isManufacturerCode('B1A2F')).toBe(true)
    expect(isManufacturerCode('U2100')).toBe(true)
    expect(isManufacturerCode('P0420')).toBe(false)
    expect(isManufacturerCode('P2187')).toBe(false)
    expect(isManufacturerCode('P3400')).toBe(false)
    expect(isManufacturerCode('U0100')).toBe(false)
    expect(isManufacturerCode('B3000')).toBe(false)
  })
})

describe('the search palette', () => {
  it('treats a code or the start of one as a code, and words as words', () => {
    for (const q of ['p0420', 'P042', 'u01', ' P0 ']) expect(looksLikeFaultCode(q), q).toBe(true)
    for (const q of ['p', 'lean bank 1', 'Peugeot', 'P4', 'P04201', 'AB12345']) {
      expect(looksLikeFaultCode(q), q).toBe(false)
    }
  })

  it('offers the fault code page only once the code service is connected', () => {
    const ids = (enabled: boolean) =>
      visiblePageCommands({ faultCodesEnabled: enabled }).map((p) => p.id)
    expect(ids(true)).toContain('page:fault-codes')
    expect(ids(false)).not.toContain('page:fault-codes')
  })
})

describe('how a code finding reads on a print', () => {
  it('prints the code and the meaning saved with it', () => {
    expect(faultLine('P0420', 'Catalyst efficiency below threshold')).toBe(
      'P0420 Catalyst efficiency below threshold'
    )
    expect(
      findingLine({
        description: 'P0420 Catalyst efficiency below threshold',
        faultCode: 'P0420',
        faultMeaning: 'Catalyst efficiency below threshold',
      })
    ).toBe('P0420 Catalyst efficiency below threshold')
  })

  it('prints the code alone when no meaning was saved, and own words with the code in front', () => {
    expect(findingLine({ description: 'P0420', faultCode: 'P0420', faultMeaning: null })).toBe(
      'P0420'
    )
    expect(
      findingLine({
        description: 'Rear O2 sensor plug chafed',
        faultCode: 'P0420',
        faultMeaning: 'x',
      })
    ).toBe('P0420 Rear O2 sensor plug chafed')
  })

  it('leaves a finding without a code as it was', () => {
    expect(findingLine({ description: 'Worn front pads', faultCode: null })).toBe('Worn front pads')
  })
})
