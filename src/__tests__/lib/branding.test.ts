import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    systemSetting: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/features', () => ({
  isCloudMode: vi.fn(),
  installHasLicense: vi.fn(),
}))

import { db } from '@/lib/db'
import { installHasLicense, isCloudMode } from '@/lib/features'
import {
  DEFAULT_APP_NAME,
  getAppBranding,
  invalidateAppBranding,
  isSafeIconFileName,
} from '@/lib/branding'
import { BRANDING_APP_NAME_MAX_LENGTH } from '@/features/admin/Schema/systemSettingsSchema'

const mockFindMany = vi.mocked(db.systemSetting.findMany)
const mockCloud = vi.mocked(isCloudMode)
const mockLicensed = vi.mocked(installHasLicense)

const DEFAULT = { name: DEFAULT_APP_NAME, iconUrl: null, custom: false }

function settings(rows: Record<string, string>) {
  mockFindMany.mockResolvedValue(
    Object.entries(rows).map(([key, value]) => ({ key, value })) as never
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  invalidateAppBranding()
  mockCloud.mockReturnValue(false)
  mockLicensed.mockResolvedValue(true)
  settings({})
})

describe('getAppBranding', () => {
  it('is TorqVoice in cloud mode, whatever is stored', async () => {
    mockCloud.mockReturnValue(true)
    settings({ 'branding.appName': 'Garage One' })

    expect(await getAppBranding()).toEqual(DEFAULT)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('is TorqVoice without a licence and does not read the branding settings', async () => {
    mockLicensed.mockResolvedValue(false)
    settings({ 'branding.appName': 'Garage One', 'branding.appIcon': 'a.png' })

    expect(await getAppBranding()).toEqual(DEFAULT)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('is TorqVoice on a licensed install with nothing set', async () => {
    expect(await getAppBranding()).toEqual(DEFAULT)
  })

  it('uses the name alone when only a name is set', async () => {
    settings({ 'branding.appName': 'Garage One' })

    expect(await getAppBranding()).toEqual({ name: 'Garage One', iconUrl: null, custom: true })
  })

  it('serves an icon from the public route with the file name as cache-buster', async () => {
    settings({ 'branding.appIcon': '3f2a-icon.png' })

    expect(await getAppBranding()).toEqual({
      name: DEFAULT_APP_NAME,
      iconUrl: '/api/public/app-icon?v=3f2a-icon.png',
      custom: true,
    })
  })

  it('trims the name and caps its length', async () => {
    settings({ 'branding.appName': `   ${'x'.repeat(BRANDING_APP_NAME_MAX_LENGTH + 20)}   ` })

    const branding = await getAppBranding()
    expect(branding.name).toBe('x'.repeat(BRANDING_APP_NAME_MAX_LENGTH))
  })

  it('treats a blank name as unset', async () => {
    settings({ 'branding.appName': '   ' })

    expect(await getAppBranding()).toEqual(DEFAULT)
  })

  it('caches the answer until invalidated', async () => {
    settings({ 'branding.appName': 'Garage One' })
    expect((await getAppBranding()).name).toBe('Garage One')

    settings({ 'branding.appName': 'Garage Two' })
    expect((await getAppBranding()).name).toBe('Garage One')
    expect(mockFindMany).toHaveBeenCalledTimes(1)
    expect(mockLicensed).toHaveBeenCalledTimes(1)

    invalidateAppBranding()
    expect((await getAppBranding()).name).toBe('Garage Two')
    expect(mockFindMany).toHaveBeenCalledTimes(2)
  })

  it('expires the cache after a minute', async () => {
    vi.useFakeTimers()
    try {
      settings({ 'branding.appName': 'Garage One' })
      await getAppBranding()
      settings({ 'branding.appName': 'Garage Two' })

      vi.advanceTimersByTime(61_000)
      expect((await getAppBranding()).name).toBe('Garage Two')
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to the default when the database fails', async () => {
    mockFindMany.mockRejectedValue(new Error('down'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(await getAppBranding()).toEqual(DEFAULT)
  })
})

describe('isSafeIconFileName', () => {
  it.each([
    ['3f2a.png', true],
    ['3f2a.JPG', true],
    ['a.webp', true],
    ['../../etc/passwd', false],
    ['x/y.png', false],
    ['x\\y.png', false],
    ['..png', false],
    ['.png', false],
    ['icon.svg', false],
    ['icon.toString', false],
    ['icon', false],
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(isSafeIconFileName(value)).toBe(expected)
  })
})
