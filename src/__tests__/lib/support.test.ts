/**
 * Tests for the gate that decides whether in-app support exists at all.
 *
 * Both conditions have to hold and each has its own failure mode. Cloud mode
 * alone would expose the button on a fresh cloud deployment before anyone had
 * agreed to answer it; the stored flag alone would expose it on a self-hosted
 * install that restored a cloud backup, mailing a support desk that has no
 * relationship with that workshop.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    systemSetting: { findUnique: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { DEFAULT_SUPPORT_RECIPIENT, getSupportRecipient, isSupportEnabled } from '@/lib/support'

const mockFindUnique = vi.mocked(db.systemSetting.findUnique)

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('isSupportEnabled', () => {
  it('is off on a self-hosted install even when the flag is set', async () => {
    vi.stubEnv('TORQVOICE_MODE', 'self-hosted')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFindUnique.mockResolvedValue({ value: 'true' } as any)
    expect(await isSupportEnabled()).toBe(false)
  })

  it('is off when no mode is configured at all', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFindUnique.mockResolvedValue({ value: 'true' } as any)
    expect(await isSupportEnabled()).toBe(false)
  })

  it('does not even read the setting outside cloud mode', async () => {
    vi.stubEnv('TORQVOICE_MODE', 'self-hosted')
    await isSupportEnabled()
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('is off in cloud mode until someone turns it on', async () => {
    vi.stubEnv('TORQVOICE_MODE', 'cloud')
    mockFindUnique.mockResolvedValue(null)
    expect(await isSupportEnabled()).toBe(false)
  })

  it("is on only in cloud mode with the flag set to exactly 'true'", async () => {
    vi.stubEnv('TORQVOICE_MODE', 'cloud')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFindUnique.mockResolvedValue({ value: 'true' } as any)
    expect(await isSupportEnabled()).toBe(true)
  })

  it('treats any other stored value as off', async () => {
    vi.stubEnv('TORQVOICE_MODE', 'cloud')
    for (const value of ['false', 'TRUE', '1', 'yes', '', ' true ']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFindUnique.mockResolvedValue({ value } as any)
      expect(await isSupportEnabled()).toBe(false)
    }
  })
})

describe('getSupportRecipient', () => {
  it('falls back to the published address when nothing is configured', async () => {
    mockFindUnique.mockResolvedValue(null)
    expect(await getSupportRecipient()).toBe(DEFAULT_SUPPORT_RECIPIENT)
  })

  it('falls back when the stored value is blank', async () => {
    // A cleared field in the admin form saves an empty string rather than
    // deleting the row, and mail to "" goes nowhere.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFindUnique.mockResolvedValue({ value: '   ' } as any)
    expect(await getSupportRecipient()).toBe(DEFAULT_SUPPORT_RECIPIENT)
  })

  it('uses the configured address, trimmed', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFindUnique.mockResolvedValue({ value: ' desk@example.com ' } as any)
    expect(await getSupportRecipient()).toBe('desk@example.com')
  })
})
