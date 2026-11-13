/**
 * The webhooks page says so when an action does not reach the server, and
 * stays on screen. An action that cannot reach the server throws instead of
 * answering; awaited inside a transition, that throw went to the error
 * boundary and the whole settings page was replaced by the error page.
 */
import { Component, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What a dropped connection does to a server action: it throws. */
const offline = async (..._args: unknown[]) => {
  throw new TypeError('Failed to fetch')
}

const toggleWebhook = vi.fn(offline)
const sendTestWebhook = vi.fn(offline)
const deleteWebhook = vi.fn(offline)
const createWebhook = vi.fn(offline)
const router = { refresh: vi.fn(), push: vi.fn() }

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/webhooks/Actions/webhookActions', () => ({
  createWebhook: (input: unknown) => createWebhook(input),
  updateWebhook: vi.fn(),
  toggleWebhook: (id: string) => toggleWebhook(id),
  deleteWebhook: (id: string) => deleteWebhook(id),
  rotateWebhookSecret: vi.fn(),
  sendTestWebhook: (id: string) => sendTestWebhook(id),
  getWebhookDeliveries: vi.fn(),
  retryWebhookDelivery: vi.fn(),
  getDeliveryPayload: vi.fn(),
}))

import { WebhooksSettings } from '@/app/(authenticated)/settings/webhooks/webhooks-settings'

/** Stands in for the app's error page, so losing the page is visible. */
class ErrorPage extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>Something went wrong</p> : this.props.children
  }
}

const WEBHOOK = {
  id: 'w1',
  name: 'Accounting sync',
  url: 'https://example.com/hooks/torqvoice',
  description: null,
  events: ['*'],
  isActive: true,
  autoDisabled: false,
  lastTriggeredAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  failureCount: 0,
  deliveryCount: 0,
  createdAt: new Date('2026-11-01T10:00:00Z'),
}

function renderPage() {
  render(
    <ErrorPage>
      <WebhooksSettings webhooks={[WEBHOOK]} />
    </ErrorPage>
  )
}

function expectPageStillThere() {
  expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Webhooks', level: 1 })).toBeInTheDocument()
}

describe('webhooks page on a dropped connection', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
    router.refresh.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('says the test event failed and keeps the page', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Send test' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to send test event'))
    expect(sendTestWebhook).toHaveBeenCalledWith('w1')
    expectPageStillThere()
    expect(screen.getByRole('button', { name: 'Send test' })).toBeEnabled()
  })

  it('says pausing failed and keeps the page', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('switch', { name: 'Enable or disable this webhook' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Toggle failed'))
    expectPageStillThere()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('says saving a new webhook failed and keeps what was typed', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Add webhook' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Parts feed' },
    })
    fireEvent.change(within(dialog).getByLabelText('Endpoint URL'), {
      target: { value: 'https://example.com/parts' },
    })
    fireEvent.click(within(dialog).getByRole('switch'))
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add webhook' }))
    })

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Save failed'))
    expect(createWebhook).toHaveBeenCalled()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByLabelText('Name')).toHaveValue('Parts feed')
  })
})
