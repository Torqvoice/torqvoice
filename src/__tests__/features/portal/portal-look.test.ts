/**
 * @vitest-environment node
 *
 * How a workshop's portal looks, read from its settings: Daylight for a
 * workshop that has chosen nothing, its own choices otherwise, and never a
 * broken page over a colour.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const files = vi.hoisted(() => ({ missing: false }))
vi.mock('node:fs/promises', () => ({
  access: vi.fn(async () => {
    if (files.missing) throw new Error('ENOENT')
  }),
}))
vi.mock('@/lib/db', () => ({ db: { appSetting: { findMany: vi.fn() } } }))
vi.mock('@/features/tire-hotel/Lib/tireHotelSettings', () => ({
  isTireHotelEnabled: vi.fn(async () => false),
}))

import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { isTireHotelEnabled } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { db } from '@/lib/db'

const settings = (rows: Record<string, string>) =>
  vi
    .mocked(db.appSetting.findMany)
    .mockResolvedValue(Object.entries(rows).map(([key, value]) => ({ key, value })) as never)

beforeEach(() => {
  files.missing = false
  vi.mocked(isTireHotelEnabled).mockResolvedValue(false)
})

describe('the look of a portal', () => {
  it('is daylight in orange with white ink, chat on, for a workshop that set nothing', async () => {
    settings({})
    expect(await loadPortalLook('org-new')).toEqual({
      theme: 'daylight',
      accent: '#C2410C',
      onAccent: '#FFFFFF',
      coverUrl: null,
      logoUrl: null,
      messagesEnabled: true,
      showTires: false,
    })
    expect(db.appSetting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-new' }) })
    )
  })

  it('is the theme and colour the workshop chose, with ink that reads on it', async () => {
    settings({ 'portal.theme': 'print', 'portal.accent': '#ffd60a' })
    expect(await loadPortalLook('org-print')).toMatchObject({
      theme: 'print',
      accent: '#FFD60A',
      onAccent: '#0C0D0E',
    })
  })

  it("starts from the chosen theme's own colour when the workshop set none", async () => {
    settings({ 'portal.theme': 'garage', 'portal.accent': 'not a colour' })
    expect(await loadPortalLook('org-garage')).toMatchObject({
      theme: 'garage',
      accent: '#FFD60A',
      onAccent: '#0C0D0E',
    })
  })

  it('serves the cover photo and logo from the public routes, by workshop id', async () => {
    settings({
      'portal.cover': '/api/protected/files/org-pics/portal/3e9a1c3f.jpg',
      'workshop.logo': '/api/protected/files/org-pics/logos/logo.png',
    })
    const look = await loadPortalLook('org-pics')
    expect(look.coverUrl).toBe('/api/public/portal-bg/org-pics?v=3e9a1c3f.jpg')
    expect(look.logoUrl).toBe('/api/public/logo/org-pics')
  })

  it('has no cover and no logo when the files behind the settings are gone', async () => {
    files.missing = true
    settings({
      'portal.cover': '/api/protected/files/org-pics/portal/3e9a1c3f.jpg',
      'workshop.logo': '/api/protected/files/org-pics/logos/logo.png',
    })
    const look = await loadPortalLook('org-gone')
    expect(look.coverUrl).toBeNull()
    expect(look.logoUrl).toBeNull()
  })

  it("turns the chat off only on the workshop's say-so", async () => {
    settings({ 'portal.messages': 'false' })
    expect((await loadPortalLook('org-quiet')).messagesEnabled).toBe(false)
    settings({ 'portal.messages': 'true' })
    expect((await loadPortalLook('org-chatty')).messagesEnabled).toBe(true)
  })

  it('shows stored tyres only when the workshop runs a tyre hotel and has not hidden them', async () => {
    settings({})
    expect((await loadPortalLook('org-no-hotel')).showTires).toBe(false)

    vi.mocked(isTireHotelEnabled).mockResolvedValue(true)
    settings({})
    expect((await loadPortalLook('org-hotel')).showTires).toBe(true)

    settings({ 'portal.showTires': 'false' })
    expect((await loadPortalLook('org-hidden')).showTires).toBe(false)
  })

  it('falls back to daylight, quietly, when the settings cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(db.appSetting.findMany).mockRejectedValue(new Error('db down'))
    expect(await loadPortalLook('org-down')).toMatchObject({ theme: 'daylight', accent: '#C2410C' })
  })
})
