// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RESTORE_IN_PROGRESS_MESSAGE,
  RestoreInProgressError,
  assertNotRestoring,
  freezeOrganization,
  isRestoring,
  unfreezeOrganization,
} from '@/lib/backup/freeze'

/** The read-only state a workshop is in while a restore replaces its rows. */

const HOUR = 60 * 60 * 1000

beforeEach(() => {
  ;(globalThis as { __torqvoiceRestoring?: Map<string, number> }).__torqvoiceRestoring?.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('freezeOrganization', () => {
  it('freezes one workshop until it is unfrozen, and no other', () => {
    expect(isRestoring('org1')).toBe(false)
    freezeOrganization('org1')
    expect(isRestoring('org1')).toBe(true)
    expect(isRestoring('org2')).toBe(false)
    unfreezeOrganization('org1')
    expect(isRestoring('org1')).toBe(false)
  })

  it('unfreezing a workshop that is not frozen does nothing', () => {
    freezeOrganization('org2')
    unfreezeOrganization('org1')
    expect(isRestoring('org2')).toBe(true)
  })

  it('treats a freeze older than eight hours as expired, and forgets it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T10:00:00Z'))
    freezeOrganization('org1')

    vi.setSystemTime(new Date('2026-10-29T17:59:00Z'))
    expect(isRestoring('org1')).toBe(true)

    vi.setSystemTime(new Date(Date.parse('2026-10-29T10:00:00Z') + 8 * HOUR + 1))
    expect(isRestoring('org1')).toBe(false)
    // Gone for good, not just hidden for this call.
    vi.setSystemTime(new Date('2026-10-29T10:30:00Z'))
    expect(isRestoring('org1')).toBe(false)
  })

  it('takes the time to judge by', () => {
    freezeOrganization('org1')
    expect(isRestoring('org1', Date.now() + HOUR)).toBe(true)
    expect(isRestoring('org1', Date.now() + 8 * HOUR + 1000)).toBe(false)
  })
})

describe('assertNotRestoring', () => {
  it('throws RestoreInProgressError while the workshop is frozen, and not after', () => {
    expect(() => assertNotRestoring('org1')).not.toThrow()
    freezeOrganization('org1')
    expect(() => assertNotRestoring('org1')).toThrow(RestoreInProgressError)
    expect(() => assertNotRestoring('org1')).toThrow(RESTORE_IN_PROGRESS_MESSAGE)
    expect(() => assertNotRestoring('org2')).not.toThrow()
    unfreezeOrganization('org1')
    expect(() => assertNotRestoring('org1')).not.toThrow()
  })

  it('names the error so it can be told apart', () => {
    const err = new RestoreInProgressError()
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('RestoreInProgressError')
    expect(err.message).toBe(RESTORE_IN_PROGRESS_MESSAGE)
  })
})
