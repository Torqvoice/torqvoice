/**
 * The ready-made fields (Reference / PO and Fleet / unit number) live at the
 * top of Settings, Invoice & Quotes, Custom Fields. Each switch saves on its
 * own when flipped, a save that fails puts it back, someone without the
 * settings permission sees them read-only, and the server refuses them on a
 * plan without custom fields or to someone who may not change settings. The
 * Workshop page no longer has them.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'

// biome-ignore lint/suspicious/noEmptyBlockStatements: a stub that measures nothing
const noop = () => {}
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)

const db = vi.hoisted(() => ({
  appSetting: { upsert: vi.fn(async () => ({})) },
  user: { findUnique: vi.fn(async () => ({ isSuperAdmin: false })) },
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const membership = vi.hoisted(() => ({
  current: { organizationId: 'org-1', role: 'owner', roleId: null, customRole: null } as {
    organizationId: string
    role: string
    roleId: string | null
    customRole: null
  },
}))
vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(async () => ({ user: { id: 'user-1', email: 'u@example.com' } })),
  getCachedMembership: vi.fn(async () => membership.current),
}))

const features = vi.hoisted(() => ({ customFields: true, customerPortal: true }))
vi.mock('@/lib/features', () => {
  class FeatureGatedError extends Error {
    constructor(public feature: string) {
      super('gated')
      this.name = 'FeatureGatedError'
    }
  }
  return {
    getFeatures: vi.fn(async () => features),
    requireFeature: vi.fn(async (_org: string, feature: keyof typeof features) => {
      if (!features[feature]) throw new FeatureGatedError(feature)
    }),
    FeatureGatedError,
  }
})

const refresh = vi.hoisted(() => vi.fn())
const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  useSearchParams: () => searchParams.current,
  usePathname: () => '/settings/invoice',
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const gated = vi.hoisted(() => vi.fn())
vi.mock('@/components/upgrade-gate', () => ({
  handleGated: (result: { gated?: unknown } | null) => {
    if (!result?.gated) return false
    gated(result.gated)
    return true
  },
}))
const permission = vi.hoisted(() => ({ canEdit: true }))
vi.mock('@/app/(authenticated)/settings/settings-permission-context', () => ({
  useSettingsPermission: () => permission,
}))

// The action, mocked for the component tests; the real one is tested below
// through `vi.importActual`.
const setReadyMadeField = vi.hoisted(() => vi.fn())
vi.mock('@/features/custom-fields/Actions/setReadyMadeField', () => ({
  setReadyMadeField: (input: unknown) => setReadyMadeField(input),
}))
vi.mock('@/features/settings/Actions/settingsActions', async () => ({
  ...(await vi.importActual<object>('@/features/settings/Actions/settingsActions')),
}))
vi.mock('@/features/invoices/Actions/legacyInvoiceActions', () => ({
  freezeUnfrozenInvoices: vi.fn(),
}))
vi.mock('@/features/invoices/Actions/invoiceDesignActions', () => ({
  reapplyDesignToIssuedInvoices: vi.fn(),
}))
vi.mock('@/features/custom-fields/Components/CustomFieldsManager', () => ({
  CustomFieldsManager: () => <div data-testid="custom-fields-manager" />,
}))
vi.mock('@/features/workboard/Actions/technicianActions', () => ({
  assignTechToUnassignedWorkOrders: vi.fn(),
  createTechnician: vi.fn(),
}))

import { ReadyMadeFields } from '@/features/custom-fields/Components/ReadyMadeFields'
import { InvoiceSettings } from '@/app/(authenticated)/settings/invoice/invoice-settings'
import { WorkshopSettings } from '@/app/(authenticated)/settings/workshop/workshop-settings'

const OFF = { customerReference: false, fleetNumber: false }

beforeEach(() => {
  vi.clearAllMocks()
  permission.canEdit = true
  features.customFields = true
  membership.current = { organizationId: 'org-1', role: 'owner', roleId: null, customRole: null }
  searchParams.current = new URLSearchParams()
  setReadyMadeField.mockResolvedValue({ success: true, data: {} })
})

const referenceSwitch = () =>
  screen.getByRole('switch', {
    name: 'Record a customer reference or PO number on work orders and quotes',
  })
const fleetSwitch = () =>
  screen.getByRole('switch', { name: 'Record a fleet or unit number on vehicles' })

describe('the ready-made fields section', () => {
  it('shows both switches with their titles and hints', () => {
    render(<ReadyMadeFields initial={{ customerReference: true, fleetNumber: false }} />)
    expect(screen.getByRole('heading', { name: 'Ready-made fields' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reference / PO' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fleet / unit number' })).toBeInTheDocument()
    expect(referenceSwitch()).toHaveAttribute('aria-checked', 'true')
    expect(fleetSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/Adds a Fleet \/ unit number field to vehicles/)).toBeInTheDocument()
  })

  it('saves the fleet number the moment it is switched on', async () => {
    render(<ReadyMadeFields initial={OFF} />)
    fireEvent.click(fleetSwitch())
    await waitFor(() =>
      expect(setReadyMadeField).toHaveBeenCalledWith({ field: 'fleetNumber', enabled: true })
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Settings saved'))
    expect(fleetSwitch()).toHaveAttribute('aria-checked', 'true')
    expect(refresh).toHaveBeenCalled()
  })

  it('saves the reference switch under its own name', async () => {
    render(<ReadyMadeFields initial={{ customerReference: true, fleetNumber: false }} />)
    fireEvent.click(referenceSwitch())
    await waitFor(() =>
      expect(setReadyMadeField).toHaveBeenCalledWith({
        field: 'customerReference',
        enabled: false,
      })
    )
  })

  it('puts the switch back when the save fails', async () => {
    setReadyMadeField.mockResolvedValue({ success: false, error: 'Database is down' })
    render(<ReadyMadeFields initial={OFF} />)
    fireEvent.click(referenceSwitch())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Database is down'))
    expect(referenceSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('puts the switch back and shows the upgrade dialog when the plan refuses it', async () => {
    setReadyMadeField.mockResolvedValue({
      success: false,
      error: 'gated',
      gated: { feature: 'customFields' },
    })
    render(<ReadyMadeFields initial={OFF} />)
    fireEvent.click(fleetSwitch())
    await waitFor(() => expect(gated).toHaveBeenCalledWith({ feature: 'customFields' }))
    expect(fleetSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('is read-only for someone who may not change settings', () => {
    permission.canEdit = false
    render(<ReadyMadeFields initial={{ customerReference: true, fleetNumber: false }} />)
    expect(referenceSwitch()).toBeDisabled()
    expect(fleetSwitch()).toBeDisabled()
    expect(referenceSwitch()).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(fleetSwitch())
    expect(setReadyMadeField).not.toHaveBeenCalled()
  })
})

describe('the Custom Fields tab', () => {
  const page = (customFieldsEnabled: boolean) => (
    <ConfirmProvider>
      <InvoiceSettings
        settings={{}}
        customFields={[]}
        customFieldsEnabled={customFieldsEnabled}
        customFieldsTop={<ReadyMadeFields initial={OFF} />}
      />
    </ConfirmProvider>
  )

  it('has the four sections in order on a plan with custom fields', () => {
    searchParams.current = new URLSearchParams('tab=customFields')
    render(page(true))
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.indexOf('Ready-made fields')).toBeLessThan(headings.indexOf('Your own fields'))
    expect(referenceSwitch()).toBeInTheDocument()
    expect(screen.getByTestId('custom-fields-manager')).toBeInTheDocument()
  })

  it('is not drawn on a plan without custom fields, whatever the address says', () => {
    searchParams.current = new URLSearchParams('tab=customFields')
    render(page(false))
    expect(screen.queryByRole('button', { name: 'Custom Fields' })).toBeNull()
    expect(screen.queryByRole('switch', { name: /customer reference/ })).toBeNull()
    expect(screen.queryByText('Ready-made fields')).toBeNull()
    expect(screen.queryByTestId('custom-fields-manager')).toBeNull()
  })
})

describe('Settings, Workshop', () => {
  it('no longer has the two switches, even with both turned on', () => {
    render(
      <WorkshopSettings
        settings={{
          'documents.customerReferenceEnabled': 'true',
          'vehicle.fleetNumberEnabled': 'true',
        }}
      />,
      { wrapper: ConfirmProvider }
    )
    expect(screen.queryByText('Reference / PO')).toBeNull()
    expect(screen.queryByText('Fleet / unit number')).toBeNull()
    expect(document.getElementById('customerReferenceEnabled')).toBeNull()
    expect(document.getElementById('fleetNumberEnabled')).toBeNull()
  })
})

describe('the server', () => {
  const action = async () =>
    (
      await vi.importActual<typeof import('@/features/custom-fields/Actions/setReadyMadeField')>(
        '@/features/custom-fields/Actions/setReadyMadeField'
      )
    ).setReadyMadeField

  it('writes the switch for this workshop', async () => {
    const result = await (await action())({ field: 'fleetNumber', enabled: true })
    expect(result.success).toBe(true)
    expect(db.appSetting.upsert).toHaveBeenCalledWith({
      where: { organizationId_key: { organizationId: 'org-1', key: 'vehicle.fleetNumberEnabled' } },
      update: { value: 'true' },
      create: {
        userId: 'user-1',
        organizationId: 'org-1',
        key: 'vehicle.fleetNumberEnabled',
        value: 'true',
      },
    })
  })

  it('refuses on a plan without custom fields', async () => {
    features.customFields = false
    const result = await (await action())({ field: 'customerReference', enabled: true })
    expect(result).toMatchObject({ success: false, gated: { feature: 'customFields' } })
    expect(db.appSetting.upsert).not.toHaveBeenCalled()
  })

  it('refuses someone without the settings permission', async () => {
    membership.current = { organizationId: 'org-1', role: 'member', roleId: null, customRole: null }
    const result = await (await action())({ field: 'customerReference', enabled: true })
    expect(result).toMatchObject({ success: false, forbidden: true })
    expect(db.appSetting.upsert).not.toHaveBeenCalled()
  })

  it('refuses anything but the two fields', async () => {
    const result = await (await action())({ field: 'portal' as never, enabled: true })
    expect(result.success).toBe(false)
    expect(db.appSetting.upsert).not.toHaveBeenCalled()
  })

  it('refuses the same switches through the general settings save on a plan without them', async () => {
    features.customFields = false
    const { setSettings } = await vi.importActual<
      typeof import('@/features/settings/Actions/settingsActions')
    >('@/features/settings/Actions/settingsActions')
    const result = await setSettings({ 'documents.customerReferenceEnabled': 'true' })
    expect(result).toMatchObject({ success: false, gated: { feature: 'customFields' } })
  })
})

describe('the hint a work order gives while the field is off', () => {
  it('names where the switch is now', async () => {
    const service = (await import('../../../../messages/en/service.json')).default
    expect(service.reference.notSwitchedOn).toContain('Settings, Invoice & Quotes, Custom Fields')
  })
})
