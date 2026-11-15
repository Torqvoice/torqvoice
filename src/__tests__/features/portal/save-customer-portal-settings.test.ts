/**
 * @vitest-environment node
 *
 * Saving the Customer Portal settings: what is stored, what is refused, and
 * that the portal (its sign-in page included, which reads the same look)
 * shows the new theme the next time it loads.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  slugs: new Map<string, string | null>(),
  planHasPortal: true,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => {
  const key = (organizationId: string, name: string) => `${organizationId}:${name}`
  const db = {
    appSetting: {
      findMany: vi.fn(
        async ({ where }: { where: { organizationId: string; key: { in: string[] } } }) =>
          where.key.in
            .filter((name) => state.settings.has(key(where.organizationId, name)))
            .map((name) => ({
              key: name,
              value: state.settings.get(key(where.organizationId, name)),
            }))
      ),
      upsert: vi.fn(
        async ({
          where,
          update,
        }: {
          where: { organizationId_key: { organizationId: string; key: string } }
          update: { value: string }
        }) => {
          const { organizationId, key: name } = where.organizationId_key
          state.settings.set(key(organizationId, name), update.value)
        }
      ),
    },
    organization: {
      findUnique: vi.fn(async ({ where }: { where: { portalSlug: string } }) => {
        const holder = [...state.slugs].find(([, slug]) => slug === where.portalSlug)
        return holder ? { id: holder[0] } : null
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: { portalSlug: string | null } }) => {
          state.slugs.set(where.id, data.portalSlug)
        }
      ),
    },
    $transaction: vi.fn(async (writes: Promise<unknown>[]) => Promise.all(writes)),
  }
  return { db }
})
vi.mock('@/lib/with-auth', () => ({
  // Signed in as someone who may change the settings of org-1.
  withAuth: async (action: (ctx: unknown) => Promise<unknown>) => {
    try {
      const data = await action({ userId: 'user-1', organizationId: 'org-1', role: 'owner' })
      return { success: true, data }
    } catch (error) {
      const gated = (error as Error).name === 'FeatureGatedError'
      return {
        success: false,
        error: (error as Error).message,
        ...(gated ? { gated: { feature: 'customerPortal' } } : {}),
      }
    }
  },
}))
vi.mock('@/lib/features', () => ({
  requireFeature: vi.fn(async () => {
    if (state.planHasPortal) return
    const error = new Error('Not on this plan')
    error.name = 'FeatureGatedError'
    throw error
  }),
}))
vi.mock('@/lib/demo', () => ({ demoGuardSettingKey: vi.fn() }))
vi.mock('@/features/settings/Lib/armFeatureHints', () => ({ armFeatureHints: vi.fn() }))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn(async () => undefined) }))
vi.mock('@/features/tire-hotel/Lib/tireHotelSettings', () => ({
  isTireHotelEnabled: vi.fn(async () => true),
}))

import { revalidatePath } from 'next/cache'
import { saveCustomerPortalSettings } from '@/features/portal/Actions/saveCustomerPortalSettings'
import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { releaseFiles } from '@/lib/files/manager'

const COVER = '/api/protected/files/org-1/portal/old-cover.jpg'

const form = {
  enabled: true,
  slug: '',
  description: '',
  theme: 'daylight',
  accent: '',
  cover: '',
  messages: true,
}

const setting = (name: string) => state.settings.get(`org-1:${name}`)

beforeEach(() => {
  state.settings.clear()
  state.slugs.clear()
  state.slugs.set('org-1', null)
  state.planHasPortal = true
  vi.mocked(releaseFiles).mockClear()
  vi.mocked(revalidatePath).mockClear()
})

describe('saving the customer portal settings', () => {
  it('stores the theme, and the portal and its sign-in page show it on the next load', async () => {
    expect((await loadPortalLook('org-1')).theme).toBe('daylight')

    const result = await saveCustomerPortalSettings({ ...form, theme: 'garage' })
    expect(result).toEqual({ success: true, data: { saved: true, slug: null } })
    expect(setting('portal.theme')).toBe('garage')

    // The portal layout draws every page, the sign-in page included, from this.
    expect(await loadPortalLook('org-1')).toMatchObject({
      theme: 'garage',
      accent: '#FFD60A',
      onAccent: '#0C0D0E',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/portal/[orgId]', 'layout')
  })

  it("stores the workshop's colour in full, and the portal uses it", async () => {
    await saveCustomerPortalSettings({ ...form, theme: 'print', accent: '1d4' })
    expect(setting('portal.accent')).toBe('#11DD44')
    expect(await loadPortalLook('org-1')).toMatchObject({ theme: 'print', accent: '#11DD44' })
  })

  it('refuses a colour that is not a colour and stores nothing', async () => {
    const result = await saveCustomerPortalSettings({ ...form, theme: 'garage', accent: '#12ZZ' })
    expect(result.success).toBe(false)
    expect(state.settings.size).toBe(0)
  })

  it('refuses a theme that does not exist', async () => {
    const result = await saveCustomerPortalSettings({ ...form, theme: 'neon' })
    expect(result.success).toBe(false)
    expect(state.settings.size).toBe(0)
  })

  it('turns the chat and the stored tyres off for customers', async () => {
    expect(await loadPortalLook('org-1')).toMatchObject({ messagesEnabled: true, showTires: true })
    await saveCustomerPortalSettings({ ...form, messages: false, showTires: false })
    expect(await loadPortalLook('org-1')).toMatchObject({
      messagesEnabled: false,
      showTires: false,
    })
  })

  it('leaves the tyres setting alone when the form does not send it', async () => {
    await saveCustomerPortalSettings(form)
    expect(setting('portal.showTires')).toBeUndefined()
    expect(setting('portal.messages')).toBe('true')
  })

  it('saves the address, and answers with the rule a bad one broke', async () => {
    state.slugs.set('org-2', 'taken-shop')

    expect((await saveCustomerPortalSettings({ ...form, slug: 'Fjordside' })).data).toEqual({
      saved: true,
      slug: 'fjordside',
    })
    expect(state.slugs.get('org-1')).toBe('fjordside')

    state.settings.clear()
    for (const [slug, problem] of [
      ['taken-shop', 'slugTaken'],
      ['admin', 'slugReserved'],
      ['a', 'slugInvalid'],
    ]) {
      expect((await saveCustomerPortalSettings({ ...form, slug, theme: 'print' })).data).toEqual({
        saved: false,
        problem,
      })
    }
    expect(state.slugs.get('org-1')).toBe('fjordside')
    expect(state.settings.size).toBe(0)
  })

  it('hands a removed cover photo to the file manager', async () => {
    state.settings.set('org-1:portal.cover', COVER)
    await saveCustomerPortalSettings({ ...form, cover: COVER })
    expect(releaseFiles).not.toHaveBeenCalled()

    await saveCustomerPortalSettings({ ...form, cover: '' })
    expect(releaseFiles).toHaveBeenCalledWith(
      [COVER],
      expect.objectContaining({ organizationId: 'org-1' })
    )
    expect((await loadPortalLook('org-1')).coverUrl).toBeNull()
  })

  it("refuses another workshop's file as the cover photo", async () => {
    const result = await saveCustomerPortalSettings({
      ...form,
      cover: '/api/protected/files/org-2/portal/theirs.jpg',
    })
    expect(result.success).toBe(false)
    expect(setting('portal.cover')).toBeUndefined()
  })

  it('is refused by a plan without the portal when turning it on', async () => {
    state.planHasPortal = false
    const result = await saveCustomerPortalSettings(form)
    expect(result.gated).toEqual({ feature: 'customerPortal' })
    expect(state.settings.size).toBe(0)

    // Turned off, the rest of the page still saves.
    expect((await saveCustomerPortalSettings({ ...form, enabled: false })).success).toBe(true)
    expect(setting('portal.enabled')).toBe('false')
  })
})
