/**
 * A shared link stays on screen until the server has revoked it. The share
 * dialogs cleared it whatever the action answered, and the Shared Link card
 * ignored the answer, so a refused revoke (a role without edit rights) or one
 * that never reached the server told the workshop the link was gone while the
 * customer's copy still opened the document.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const revokeQuotePublicLink = vi.fn()
const generateQuotePublicLink = vi.fn()
const revokePublicLink = vi.fn()
const generatePublicLink = vi.fn()
const revokeInspectionPublicLink = vi.fn()
const generateInspectionPublicLink = vi.fn()
const router = { push: vi.fn(), refresh: vi.fn() }

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
// Async wrappers, as a real server action is: a dropped connection rejects
// the promise rather than throwing on the call.
vi.mock('@/features/quotes/Actions/quoteShareActions', () => ({
  revokeQuotePublicLink: async (id: string) => revokeQuotePublicLink(id),
  generateQuotePublicLink: async (id: string) => generateQuotePublicLink(id),
}))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  revokePublicLink: async (id: string) => revokePublicLink(id),
  generatePublicLink: async (id: string) => generatePublicLink(id),
}))
vi.mock('@/features/inspections/Actions/inspectionShareActions', () => ({
  revokeInspectionPublicLink: async (id: string) => revokeInspectionPublicLink(id),
  generateInspectionPublicLink: async (id: string) => generateInspectionPublicLink(id),
}))
vi.mock('@/features/email/Actions/emailActions', () => ({
  sendQuoteEmail: vi.fn(),
  sendInvoiceEmail: vi.fn(),
  sendInspectionEmail: vi.fn(),
}))
vi.mock('@/features/sms/Actions/smsActions', () => ({
  sendSmsToCustomer: vi.fn(),
  getSmsTemplates: vi.fn(),
}))
vi.mock('@/features/messaging/Lib/useShareChannels', () => ({
  useShareChannels: () => ({ sms: 'ready', isCloud: false }),
}))
vi.mock('@/features/email/Actions/emailPreferenceActions', () => ({
  getAttachPdfDefault: async () => ({ success: true, data: { attachPdf: true } }),
}))

import { QuoteShareDialog } from '@/features/quotes/Components/QuoteShareDialog'
import { ShareDialog } from '@/features/vehicles/Components/service-detail/ShareDialog'
import { InspectionShareDialog } from '@/features/inspections/Components/InspectionShareDialog'
import { SharedLinkCard } from '@/components/shared-link-card'

const REVOKE_FAILED =
  "Couldn't confirm the link was revoked. It may still work for anyone who has it."
const GENERATE_FAILED = "Couldn't create the link. Try again."
const DROPPED = () => {
  throw new TypeError('Failed to fetch')
}

/** Stands in for the app's error page, which a transition's throw would reach. */
class ErrorPage extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>Error page</p> : this.props.children
  }
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

function linkField() {
  return screen.queryByDisplayValue(/\/share\//)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('quote share dialog', () => {
  function renderDialog() {
    render(
      <QuoteShareDialog
        open
        onOpenChange={vi.fn()}
        quoteId="q1"
        organizationId="org1"
        initialToken="tok"
      />
    )
  }

  it('keeps the link and says so when the server refuses the revoke', async () => {
    revokeQuotePublicLink.mockResolvedValue({ success: false, error: 'Forbidden' })
    renderDialog()
    await click('Revoke Link')
    expect(linkField()).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(REVOKE_FAILED)
    expect(screen.getByRole('button', { name: 'Revoke Link' })).toBeEnabled()
  })

  it('keeps the link when the revoke never reached the server', async () => {
    revokeQuotePublicLink.mockImplementation(DROPPED)
    renderDialog()
    await click('Revoke Link')
    expect(linkField()).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(REVOKE_FAILED)
  })

  it('removes the link once the server has revoked it', async () => {
    revokeQuotePublicLink.mockResolvedValue({ success: true, data: { revoked: true } })
    renderDialog()
    await click('Revoke Link')
    expect(linkField()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate Public Link' })).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('invoice share dialog', () => {
  function renderDialog(token: string | null) {
    render(
      <ShareDialog
        open
        onOpenChange={vi.fn()}
        recordId="r1"
        organizationId="org1"
        initialToken={token}
      />
    )
  }

  it('keeps the link and says so when the server refuses the revoke', async () => {
    revokePublicLink.mockResolvedValue({ success: false, error: 'Forbidden' })
    renderDialog('tok')
    await click('Revoke Link')
    expect(linkField()).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(REVOKE_FAILED)
    expect(screen.getByRole('button', { name: 'Revoke Link' })).toBeEnabled()
  })

  it('keeps the link when the revoke never reached the server', async () => {
    revokePublicLink.mockImplementation(DROPPED)
    renderDialog('tok')
    await click('Revoke Link')
    expect(linkField()).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(REVOKE_FAILED)
  })

  it('says so when a new link cannot be created, and lets it be tried again', async () => {
    generatePublicLink.mockImplementation(DROPPED)
    renderDialog(null)
    await click('Generate Public Link')
    expect(toast.error).toHaveBeenCalledWith(GENERATE_FAILED)
    expect(screen.getByRole('button', { name: 'Generate Public Link' })).toBeEnabled()
  })
})

describe('inspection share dialog', () => {
  function renderDialog() {
    render(
      <ErrorPage>
        <InspectionShareDialog
          open
          onOpenChange={vi.fn()}
          inspectionId="i1"
          organizationId="org1"
          publicToken="tok"
        />
      </ErrorPage>
    )
  }

  it('stays on the page and keeps the link when the revoke never reached the server', async () => {
    revokeInspectionPublicLink.mockImplementation(DROPPED)
    renderDialog()
    await click('Revoke Link')
    expect(screen.queryByText('Error page')).not.toBeInTheDocument()
    expect(linkField()).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(REVOKE_FAILED)
  })

  it('keeps the link when the server refuses the revoke', async () => {
    revokeInspectionPublicLink.mockResolvedValue({ success: false, error: 'Forbidden' })
    renderDialog()
    await click('Revoke Link')
    expect(linkField()).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(REVOKE_FAILED)
  })
})

describe('shared link card', () => {
  function renderCard(onRevoke: () => Promise<boolean>) {
    render(
      <SharedLinkCard
        publicToken="tok"
        organizationId="org1"
        type="invoice"
        sharedAt={null}
        viewCount={0}
        lastViewedAt={null}
        onRevoke={onRevoke}
      />
    )
    // The revoke button is the one without a label of its own.
    return screen.getAllByRole('button').find((b) => !b.getAttribute('aria-label'))!
  }

  it('says the link still works when the revoke was refused', async () => {
    const button = renderCard(async () => false)
    await act(async () => {
      fireEvent.click(button)
    })
    expect(toast.error).toHaveBeenCalledWith(REVOKE_FAILED)
    expect(button).toBeEnabled()
  })

  it('says the link still works when the revoke never reached the server', async () => {
    const button = renderCard(async () => DROPPED())
    await act(async () => {
      fireEvent.click(button)
    })
    expect(toast.error).toHaveBeenCalledWith(REVOKE_FAILED)
  })

  it('stays quiet when the revoke went through', async () => {
    const button = renderCard(async () => true)
    await act(async () => {
      fireEvent.click(button)
    })
    expect(toast.error).not.toHaveBeenCalled()
  })
})
