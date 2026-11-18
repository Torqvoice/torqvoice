import { describe, expect, it } from 'vitest'
import {
  adjustsHours,
  DEFAULT_PREFS,
  hoursToAdd,
  meetsConfidence,
  readPrefs,
} from '@/features/integrations/Lib/repair-prefs'
import { withServerKeys } from '@/integrations/registry'
import { manifest } from '@/integrations/openlaborproject/manifest'

describe('readPrefs', () => {
  it('fills in the defaults for a connection that saved nothing', () => {
    expect(readPrefs({})).toEqual(DEFAULT_PREFS)
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS)
  })

  it('takes what the workshop saved', () => {
    expect(
      readPrefs({
        minConfidence: 'high',
        hoursFrom: 'high',
        adjustPercent: 15,
        rounding: '0.25',
        fluids: false,
        units: 'us',
      })
    ).toEqual({
      minConfidence: 'high',
      hoursFrom: 'high',
      adjustPercent: 15,
      rounding: '0.25',
      fluids: false,
      units: 'us',
    })
  })

  it('keeps the adjustment within bounds and drops values it does not know', () => {
    expect(readPrefs({ adjustPercent: 900 }).adjustPercent).toBe(200)
    expect(readPrefs({ adjustPercent: -90 }).adjustPercent).toBe(-50)
    expect(readPrefs({ adjustPercent: 'abc' }).adjustPercent).toBe(0)
    expect(readPrefs({ rounding: '0.3', units: 'imperial' })).toMatchObject({
      rounding: 'none',
      units: 'both',
    })
  })
})

describe('hoursToAdd', () => {
  const job = { hours: 1.2, high: 1.6 }

  it('adds the book time as it is by default', () => {
    expect(hoursToAdd(job, DEFAULT_PREFS)).toBe(1.2)
    expect(adjustsHours(DEFAULT_PREFS)).toBe(false)
  })

  it('takes the top of the range when the workshop prefers it', () => {
    expect(hoursToAdd(job, { ...DEFAULT_PREFS, hoursFrom: 'high' })).toBe(1.6)
    // A job without a range falls back to its book time.
    expect(hoursToAdd({ hours: 1.2, high: null }, { ...DEFAULT_PREFS, hoursFrom: 'high' })).toBe(
      1.2
    )
  })

  it('adjusts, then rounds up to the step', () => {
    expect(hoursToAdd(job, { ...DEFAULT_PREFS, adjustPercent: 10 })).toBe(1.32)
    expect(hoursToAdd(job, { ...DEFAULT_PREFS, adjustPercent: 10, rounding: '0.1' })).toBe(1.4)
    expect(hoursToAdd(job, { ...DEFAULT_PREFS, rounding: '0.25' })).toBe(1.25)
    expect(hoursToAdd(job, { ...DEFAULT_PREFS, rounding: '0.5' })).toBe(1.5)
  })

  it('leaves a value already on the step where it is', () => {
    expect(hoursToAdd({ hours: 1.2, high: null }, { ...DEFAULT_PREFS, rounding: '0.1' })).toBe(1.2)
    expect(hoursToAdd({ hours: 0.3, high: null }, { ...DEFAULT_PREFS, rounding: '0.1' })).toBe(0.3)
  })

  it('has nothing to add for a job the key has not unlocked', () => {
    expect(hoursToAdd({ hours: null, high: null }, DEFAULT_PREFS)).toBeNull()
  })
})

describe('meetsConfidence', () => {
  it('ranks the levels from estimate up to OEM', () => {
    const at = (confidence: 'oem' | 'high' | 'medium' | 'estimated' | null) => ({
      confidence,
      locked: false,
    })
    expect(meetsConfidence(at('estimated'), 'all')).toBe(true)
    expect(meetsConfidence(at('estimated'), 'medium')).toBe(false)
    expect(meetsConfidence(at('medium'), 'medium')).toBe(true)
    expect(meetsConfidence(at('medium'), 'high')).toBe(false)
    expect(meetsConfidence(at('oem'), 'high')).toBe(true)
    expect(meetsConfidence(at('high'), 'oem')).toBe(false)
    expect(meetsConfidence(at(null), 'medium')).toBe(false)
  })

  it('keeps a value the key has not shown yet, since it has no level to judge', () => {
    expect(meetsConfidence({ confidence: null, locked: true }, 'oem')).toBe(true)
  })
})

describe('withServerKeys', () => {
  const field = () => (manifest.auth.type === 'api-key' ? manifest.auth.fields[0] : (null as never))

  it('asks every workshop for its own key while the server holds none', () => {
    expect(withServerKeys(manifest, {})).toBe(manifest)
    expect(field()).toMatchObject({ required: true, help: 'apiKeyHelp' })
  })

  it("makes the workshop's key optional once the server holds one", () => {
    const out = withServerKeys(manifest, { OPEN_LABOR_PROJECT_API_KEY: 'server-key' })
    const fields = out.auth.type === 'api-key' ? out.auth.fields : []
    expect(fields[0]).toMatchObject({ required: false, help: 'apiKeyServerHelp' })
    // The manifest itself is left alone.
    expect(field().required).toBe(true)
  })

  it('treats a blank variable as unset', () => {
    expect(withServerKeys(manifest, { OPEN_LABOR_PROJECT_API_KEY: '  ' })).toBe(manifest)
  })
})
