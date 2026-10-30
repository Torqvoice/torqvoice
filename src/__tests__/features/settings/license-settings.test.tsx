/**
 * The licence page's "make it yours" list. It is always there, so a workshop
 * sees what the licence unlocks: the app name and icon rows are locked until
 * the licence is valid, then link a super admin to the admin page. Members
 * are told only a super admin can change those two.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { LicenseTokenStatus } from '@/lib/license/token'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/features/settings/Actions/validateLicense', () => ({ validateLicense: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { LicenseSettings } = await import('@/features/settings/Components/license-settings')

const ADMIN_HREF = '/admin/settings#app-branding'
const SUPER_ADMIN_NOTE = /only a super admin can change the app name and icon/i

function renderPage(status: LicenseTokenStatus, brandingHref: string | null) {
  return render(
    <LicenseSettings
      initialKey="TV-KEY"
      initialStatus={status}
      initialExpiresAt=""
      initialIssuedAt=""
      initialCheckedAt=""
      brandingHref={brandingHref}
    />
  )
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
    expect(screen.getAllByRole('link')).toHaveLength(2)
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
