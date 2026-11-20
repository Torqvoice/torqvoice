/**
 * The fleet and heavy vehicle setup checklist is there only for a workshop
 * that asked for it: nothing is read or drawn otherwise. Asked for on a plan
 * without custom fields, it answers with the upgrade gate rather than a list
 * of locked links. Opened, each step says whether it is on and links straight
 * to its switch, and the docs link is the one locale-free guide.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  appSetting: { findFirst: vi.fn(), findMany: vi.fn(async () => []), upsert: vi.fn() },
  customFieldDefinition: { count: vi.fn(async () => 0) },
  meterType: { count: vi.fn(async () => 0) },
  equipmentType: { count: vi.fn(async () => 0) },
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const features = vi.hoisted(() => ({ customFields: true }))
vi.mock('@/lib/features', async () => {
  class FeatureGatedError extends Error {
    constructor(public feature: string) {
      super('gated')
      this.name = 'FeatureGatedError'
    }
  }
  return {
    getFeatures: vi.fn(async () => features),
    requireFeature: vi.fn(async (_org: string, feature: string) => {
      if (!features[feature as 'customFields']) throw new FeatureGatedError(feature)
    }),
    FeatureGatedError,
  }
})
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { userId: string; organizationId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ userId: 'user-1', organizationId: 'org-1' }) }
    } catch (error) {
      const e = error as Error & { feature?: string }
      return e.name === 'FeatureGatedError'
        ? { success: false, error: e.message, gated: { feature: e.feature } }
        : { success: false, error: e.message }
    }
  },
}))
const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const gated = vi.hoisted(() => vi.fn())
vi.mock('@/components/upgrade-gate', () => ({
  handleGated: (result: { gated?: unknown }) => {
    if (!result?.gated) return false
    gated(result.gated)
    return true
  },
}))
vi.mock('@/components/service-type-context', () => ({ useServiceType: () => 'automotive' }))
const permission = vi.hoisted(() => ({ canEdit: true }))
vi.mock('@/app/(authenticated)/settings/settings-permission-context', () => ({
  useSettingsPermission: () => permission,
}))

import { heavyVehicleSetupState } from '@/features/setup/Lib/heavyVehicleSetup.server'
import { openHeavyVehicleSetup } from '@/features/setup/Actions/heavyVehicleSetupActions'
import {
  HEAVY_VEHICLE_DOCS_URL,
  HeavyVehicleSetupCard,
  HeavyVehicleSetupLink,
} from '@/features/setup/Components/HeavyVehicleSetupCard'

beforeEach(() => {
  vi.clearAllMocks()
  permission.canEdit = true
  features.customFields = true
  db.appSetting.findFirst.mockResolvedValue(null)
})

describe('a workshop that has not asked for the checklist', () => {
  it('is shown nothing and nothing about it is read', async () => {
    expect(await heavyVehicleSetupState('org-1')).toBeNull()
    expect(db.meterType.count).not.toHaveBeenCalled()
    expect(db.equipmentType.count).not.toHaveBeenCalled()
  })

  it('on a plan without custom fields is not even asked whether it did', async () => {
    features.customFields = false
    expect(await heavyVehicleSetupState('org-1')).toBeNull()
    expect(db.appSetting.findFirst).not.toHaveBeenCalled()
  })

  it('that put it away is shown nothing', async () => {
    db.appSetting.findFirst.mockResolvedValue({ value: 'dismissed' })
    expect(await heavyVehicleSetupState('org-1')).toBeNull()
  })
})

describe('asking for the checklist', () => {
  it('opens it for this workshop', async () => {
    const result = await openHeavyVehicleSetup()
    expect(result.success).toBe(true)
    expect(db.appSetting.upsert).toHaveBeenCalledWith({
      where: { organizationId_key: { organizationId: 'org-1', key: 'setup.heavyVehiclesCard' } },
      update: { value: 'open' },
      create: {
        organizationId: 'org-1',
        userId: 'user-1',
        key: 'setup.heavyVehiclesCard',
        value: 'open',
      },
    })
  })

  it('on a plan without custom fields shows the upgrade gate and opens nothing', async () => {
    features.customFields = false
    render(<HeavyVehicleSetupLink />)
    fireEvent.click(screen.getByRole('button', { name: 'Open the setup checklist' }))
    await waitFor(() => expect(gated).toHaveBeenCalledWith({ feature: 'customFields' }))
    expect(db.appSetting.upsert).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})

describe('the checklist', () => {
  it('reads which of the five are on', async () => {
    db.appSetting.findFirst.mockResolvedValue({ value: 'open' })
    db.appSetting.findMany.mockResolvedValue([
      { key: 'documents.customerReferenceEnabled', value: 'true' },
      { key: 'vehicle.fleetNumberEnabled', value: 'false' },
    ] as never)
    db.meterType.count.mockResolvedValue(2)
    expect(await heavyVehicleSetupState('org-1')).toEqual({
      reference: true,
      fleetNumber: false,
      customFields: false,
      meters: true,
      equipment: false,
    })
  })

  it('says which steps are on and links each straight to its switch', () => {
    render(
      <HeavyVehicleSetupCard
        state={{
          reference: true,
          fleetNumber: false,
          customFields: false,
          meters: true,
          equipment: false,
        }}
      />
    )
    expect(screen.getByText('2 of 5 turned on')).toBeInTheDocument()
    const link = (name: RegExp) => screen.getByRole('link', { name })
    expect(link(/Reference \/ PO/)).toHaveAttribute(
      'href',
      '/settings/workshop#customerReferenceEnabled'
    )
    expect(link(/Reference \/ PO/)).toHaveTextContent('On')
    expect(link(/Fleet or unit number/)).toHaveAttribute(
      'href',
      '/settings/workshop#fleetNumberEnabled'
    )
    expect(link(/Fleet or unit number/)).toHaveTextContent('Turn on')
    expect(link(/^Meters/)).toHaveAttribute('href', '/settings/custom-fields#meters')
    expect(link(/^Equipment/)).toHaveAttribute('href', '/settings/custom-fields#equipment')
    expect(link(/guide/)).toHaveAttribute('href', HEAVY_VEHICLE_DOCS_URL)
    // The docs are linked without a language or an anchor.
    expect(HEAVY_VEHICLE_DOCS_URL).toBe('https://torqvoice.com/docs/heavy-vehicles')
  })
})

describe('the checklist by keyboard', () => {
  const state = {
    reference: true,
    fleetNumber: false,
    customFields: false,
    meters: false,
    equipment: false,
  }

  it('takes the focus when it was just opened, and not on an ordinary visit', () => {
    window.history.replaceState(null, '', '#heavy-vehicle-setup')
    const { unmount } = render(<HeavyVehicleSetupCard state={state} />)
    expect(screen.getByTestId('heavy-vehicle-setup')).toHaveFocus()
    unmount()
    window.history.replaceState(null, '', '#')
    render(<HeavyVehicleSetupCard state={state} />)
    expect(screen.getByTestId('heavy-vehicle-setup')).not.toHaveFocus()
  })

  it('draws a ring round the step that has the focus, not only a faint fill', () => {
    render(<HeavyVehicleSetupCard state={state} />)
    for (const link of screen.getAllByRole('link').filter((l) => l.closest('li'))) {
      expect(link.className).toContain('focus-visible:ring-2')
      expect(link.className).toContain('focus-visible:ring-ring')
    }
  })
})

describe('someone who may only read settings', () => {
  const state = {
    reference: false,
    fleetNumber: false,
    customFields: false,
    meters: false,
    equipment: false,
  }

  it('is not offered the line that opens it', () => {
    permission.canEdit = false
    const { container } = render(<HeavyVehicleSetupLink />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sees an open checklist but cannot put it away', () => {
    permission.canEdit = false
    render(<HeavyVehicleSetupCard state={state} />)
    expect(screen.queryByRole('button', { name: 'Close the setup checklist' })).toBeNull()
    expect(screen.getByRole('link', { name: /Reference \/ PO/ })).toBeInTheDocument()
  })
})
