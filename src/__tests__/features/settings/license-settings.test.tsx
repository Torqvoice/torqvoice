/**
 * The licence page's "make it yours" list. It is always there, so a workshop
 * sees what the licence unlocks: the app name and icon rows are locked until
 * the licence is valid, then link a super admin to the admin page. Members
 * are told only a super admin can change those two.
 *
 * The offline licence: who it was issued to, why it does not match this
 * workshop, and the request card that hands torqvoice.com what it needs to
 * mint one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { LicenseTokenStatus, PerpetualLicensee } from '@/lib/license/token'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/features/settings/Actions/validateLicense', () => ({ validateLicense: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { LicenseSettings } = await import('@/features/settings/Components/license-settings')
const { validateLicense } = await import('@/features/settings/Actions/validateLicense')
const { toast } = await import('sonner')

const ADMIN_HREF = '/admin/settings#app-branding'
const SUPER_ADMIN_NOTE = /only a super admin can change the app name and icon/i

const ORG_ID = 'org_123'
const WORKSHOP = 'Bilverksted Øst'
const LICENSEE: PerpetualLicensee = {
  name: 'Bilverksted Øst AS',
  registrationNumber: '987654321',
  country: 'NO',
}

type Props = ComponentProps<typeof LicenseSettings>

function renderSettings(overrides: Partial<Props> = {}) {
  return render(
    <LicenseSettings
      initialKey="TV-KEY"
      initialStatus="missing"
      initialKind={null}
      initialLicensee={null}
      initialMaxOrganizations={null}
      initialExpiresAt=""
      initialIssuedAt=""
      initialCheckedAt=""
      organizationId={ORG_ID}
      workshopName={WORKSHOP}
      registrationNumber="987654321"
      brandingHref={ADMIN_HREF}
      {...overrides}
    />
  )
}

function renderPage(status: LicenseTokenStatus, brandingHref: string | null) {
  return renderSettings({
    initialStatus: status,
    initialKind: status === 'missing' ? null : 'subscription',
    brandingHref,
  })
}

function renderPerpetual(status: LicenseTokenStatus, registrationNumber = '987654321') {
  return renderSettings({
    initialKey: 'tvp1.payload.signature',
    initialStatus: status,
    initialKind: 'perpetual',
    initialLicensee: LICENSEE,
    initialMaxOrganizations: 1,
    initialIssuedAt: '2020-01-01T00:00:00.000Z',
    initialCheckedAt: '2020-01-01T00:00:00.000Z',
    registrationNumber,
  })
}

/** What torqvoice.com reads back out of the request code. */
function decodeRequestCode(code: string): unknown {
  expect(code.startsWith('tvr1.')).toBe(true)
  const base64 = code.slice(5).replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
}

describe('LicenseSettings next steps', () => {
  it('links a super admin to the app branding once the licence is valid', () => {
    renderPage('valid', ADMIN_HREF)

    expect(screen.getByText('Make it yours')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /set your app name/i })).toHaveAttribute(
      'href',
      ADMIN_HREF
    )
    expect(
      screen.getByRole('link', { name: /add your own favicon and app icon/i })
    ).toHaveAttribute('href', ADMIN_HREF)
    // Those two and nothing else: the list is about what the licence unlocks.
    const steps = within(document.getElementById('license-next-steps') as HTMLElement)
    expect(steps.getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByText('Needs a licence')).not.toBeInTheDocument()
    expect(screen.queryByText(SUPER_ADMIN_NOTE)).not.toBeInTheDocument()
  })

  it('lists the admin steps without links for a member, and says who can change them', () => {
    renderPage('valid', null)

    expect(screen.getByText('Set your app name')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /set your app name/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /favicon/i })).not.toBeInTheDocument()
    expect(screen.getByText(SUPER_ADMIN_NOTE)).toBeInTheDocument()
  })

  it.each([
    'missing',
    'stale',
    'expired',
    'invalid',
  ] satisfies LicenseTokenStatus[])('keeps the rows in view but locked while the licence is %s', (status) => {
    renderPage(status, ADMIN_HREF)

    expect(screen.getByText('Make it yours')).toBeInTheDocument()
    expect(screen.getByText(/licence unlocks the app name and icon/i)).toBeInTheDocument()
    expect(screen.getByText('Set your app name')).toBeInTheDocument()
    expect(screen.getByText('Add your own favicon and app icon')).toBeInTheDocument()
    expect(screen.getAllByText('Needs a licence')).toHaveLength(2)
    expect(screen.queryByRole('link', { name: /set your app name/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /favicon/i })).not.toBeInTheDocument()
    // The purchase button above the list is the only link on the page.
    const steps = within(document.getElementById('license-next-steps') as HTMLElement)
    expect(steps.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(SUPER_ADMIN_NOTE)).not.toBeInTheDocument()
  })

  it('tells a member without a licence both things: locked, and who can change it later', () => {
    renderPage('missing', null)

    expect(screen.getAllByText('Needs a licence')).toHaveLength(2)
    expect(screen.getByText(SUPER_ADMIN_NOTE)).toBeInTheDocument()
  })
})

describe('LicenseSettings offline licence', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
    vi.mocked(validateLicense).mockReset()
  })

  it('names the licensee and marks a valid offline licence as perpetual', () => {
    renderPerpetual('valid')

    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Perpetual')).toBeInTheDocument()
    expect(
      screen.getByText('Licensed to Bilverksted Øst AS (987654321), Norway')
    ).toBeInTheDocument()
    expect(
      screen.getByText(/verified on this server and never needs to contact torqvoice\.com/i)
    ).toBeInTheDocument()
    // No term and no check-in for a licence that never calls home.
    expect(screen.queryByText(/^Expires:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Last checked:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/has not been able to confirm/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /purchase white-label/i })).not.toBeInTheDocument()
  })

  it('explains a mismatch with the number this workshop has now', () => {
    renderPerpetual('mismatch', '111222333')

    expect(screen.getByText('Does not match this workshop')).toBeInTheDocument()
    expect(screen.queryByText('Perpetual')).not.toBeInTheDocument()
    const licensee = within(document.getElementById('license-licensee') as HTMLElement)
    expect(
      licensee.getByText(
        /issued to organization number 987654321, but this workshop's organization number is 111222333/i
      )
    ).toBeInTheDocument()
    expect(licensee.getByRole('link', { name: 'Open Company settings' })).toHaveAttribute(
      'href',
      '/settings/company#orgNumber'
    )
    // A replacement can still be pasted.
    expect(screen.getByPlaceholderText(/licence key or an offline licence token/i)).toBeVisible()
  })

  it('says so when the workshop has no organization number at all', () => {
    renderPerpetual('mismatch', '')

    expect(
      screen.getByText(/but this workshop has no organization number set/i)
    ).toBeInTheDocument()
  })

  it('offers a request code carrying the workshop, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPage('valid', ADMIN_HREF)

    const card = within(document.getElementById('license-offline') as HTMLElement)
    expect(card.getByText('Offline licence')).toBeInTheDocument()
    expect(card.getByText(ORG_ID)).toBeInTheDocument()
    expect(card.getByText(WORKSHOP)).toBeInTheDocument()
    expect(card.getByText('987654321')).toBeInTheDocument()

    const code = (card.getByLabelText('Licence request code') as HTMLInputElement).value
    expect(decodeRequestCode(code)).toEqual({
      v: 1,
      org: ORG_ID,
      name: WORKSHOP,
      registrationNumber: '987654321',
    })

    fireEvent.click(card.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(code))
    expect(toast.success).toHaveBeenCalledWith('Request code copied')
    expect(card.getByRole('link', { name: /order offline licence/i })).toHaveAttribute(
      'href',
      'https://torqvoice.com/subscriptions/offline-license'
    )
  })

  it('will not hand out a request code until the organization number is set', () => {
    renderSettings({ registrationNumber: '  ' })

    const card = within(document.getElementById('license-offline') as HTMLElement)
    expect(card.getByText('Not set')).toBeInTheDocument()
    expect(card.getByRole('link', { name: 'Open Company settings' })).toHaveAttribute(
      'href',
      '/settings/company#orgNumber'
    )
    expect(card.getByText(/organization number is required/i)).toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Copy' })).toBeDisabled()
    expect((card.getByLabelText('Licence request code') as HTMLInputElement).value).toBe('')
  })

  it('hides the offline card once a perpetual licence is active, and in the demo', () => {
    const { unmount } = renderPerpetual('valid')
    expect(document.getElementById('license-offline')).toBeNull()
    unmount()

    renderSettings({ demoMode: true })
    expect(document.getElementById('license-offline')).toBeNull()
  })

  it('keeps the offline card for a perpetual licence that does not match', () => {
    renderPerpetual('mismatch', '111222333')
    expect(document.getElementById('license-offline')).not.toBeNull()
  })

  it('says the offline licence is activated, never that torqvoice.com was unreachable', async () => {
    vi.mocked(validateLicense).mockResolvedValue({
      success: true,
      data: {
        status: 'valid',
        valid: true,
        plan: 'white-label',
        reachable: true,
        kind: 'perpetual',
        licensee: LICENSEE,
      },
    } as Awaited<ReturnType<typeof validateLicense>>)
    renderSettings()

    fireEvent.change(screen.getByPlaceholderText(/licence key or an offline licence token/i), {
      target: { value: 'tvp1.payload.signature' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Offline licence activated'))
    expect(toast.error).not.toHaveBeenCalled()
    expect(await screen.findByText('Perpetual')).toBeInTheDocument()
    expect(
      screen.getByText('Licensed to Bilverksted Øst AS (987654321), Norway')
    ).toBeInTheDocument()
  })

  it('shows the mismatch message when the pasted token names another business', async () => {
    vi.mocked(validateLicense).mockResolvedValue({
      success: true,
      data: {
        status: 'mismatch',
        valid: false,
        plan: 'white-label',
        reachable: true,
        kind: 'perpetual',
        licensee: { ...LICENSEE, registrationNumber: '555666777' },
      },
    } as Awaited<ReturnType<typeof validateLicense>>)
    renderSettings()

    fireEvent.change(screen.getByPlaceholderText(/licence key or an offline licence token/i), {
      target: { value: 'tvp1.payload.signature' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This licence was issued to organization number 555666777, but this workshop's organization number is 987654321."
      )
    )
  })
})
