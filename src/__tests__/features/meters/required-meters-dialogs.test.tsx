/**
 * Sharing or sending an invoice refused for readings the workshop requires,
 * from a dialog over the work order. Open, the dialog holds the focus inside
 * itself, so the meter box could not take it: the dialog closes, and once it
 * has given the focus back the first empty box takes it. On a page without
 * the boxes the dialog stays open with the message, since closing it would
 * leave nowhere to type the reading. Closed by the person while it was still
 * sending, the boxes are only marked: they have moved on.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const generatePublicLink = vi.fn()
const sendInvoiceLink = vi.fn()
const refresh = vi.fn()

class NoResize {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', NoResize)

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/features/meters/Actions/jobMeterActions', () => ({ setJobMeterReading: vi.fn() }))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  generatePublicLink: async (id: string) => generatePublicLink(id),
  revokePublicLink: vi.fn(),
}))
vi.mock('@/features/messaging/Actions/sendDocumentLink', () => ({
  sendQuoteLink: vi.fn(),
  sendInvoiceLink: async (input: unknown) => sendInvoiceLink(input),
  sendInspectionLink: vi.fn(),
}))
vi.mock('@/features/messaging/Lib/useShareChannels', () => ({
  useShareChannels: () => ({ email: 'ready', sms: 'ready', whatsapp: 'ready', isCloud: false }),
  useWhatsappReach: () => true,
}))
vi.mock('@/features/email/Actions/emailPreferenceActions', () => ({
  getAttachPdfDefault: async () => ({ success: true, data: { attachPdf: false } }),
}))

import { JobMeters } from '@/features/meters/Components/JobMeters'
import { ShareDialog } from '@/features/vehicles/Components/service-detail/ShareDialog'
import { SendDocumentDialog } from '@/features/messaging/Components/SendDocumentDialog'

const PTO_VIEW = {
  vehicleMeterId: 'vm-pto',
  meterTypeId: 't-pto',
  name: 'PTO hours',
  unit: 'hrs',
  value: null,
  last: null,
  required: true,
}
const PTO = { vehicleMeterId: 'vm-pto', meterTypeId: 't-pto', name: 'PTO hours', item: null }
const REFUSED = { success: false, error: 'Not sent. Fill in: PTO hours', requiredMeters: [PTO] }

const sendEmail = vi.fn()

/** The work order: its meter list (or none) and the two ways the invoice is handed over. */
function WorkOrder({ withMeters = true }: { withMeters?: boolean }) {
  const [share, setShare] = useState(false)
  const [send, setSend] = useState(false)
  return (
    <QueryClientProvider client={new QueryClient()}>
      <button type="button" onClick={() => setShare(true)}>
        Open share
      </button>
      <button type="button" onClick={() => setSend(true)}>
        Open send
      </button>
      {withMeters && <JobMeters jobId="job-1" meters={[PTO_VIEW]} />}
      <ShareDialog
        open={share}
        onOpenChange={setShare}
        recordId="job-1"
        organizationId="org-1"
        initialToken={null}
      />
      <SendDocumentDialog
        open={send}
        onOpenChange={setSend}
        kind="invoice"
        documentId="job-1"
        customer={{ id: 'c1', name: 'ZZ Test', email: 'zz@example.com', phone: '+4790000000' }}
        sendEmail={sendEmail}
      />
    </QueryClientProvider>
  )
}

// Hidden from the accessibility tree while a dialog is open over it, so asked for regardless.
const ptoBox = () => screen.getByRole('textbox', { name: /PTO hours/, hidden: true })

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  generatePublicLink.mockResolvedValue(REFUSED)
  sendEmail.mockResolvedValue(REFUSED)
  sendInvoiceLink.mockResolvedValue(REFUSED)
})

describe('making a share link', () => {
  it('closes the dialog and puts the cursor in the first empty box', async () => {
    render(<WorkOrder />)
    fireEvent.click(screen.getByRole('button', { name: 'Open share' }))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Generate Public Link' }))
    })
    expect(toast.error).toHaveBeenCalledWith('Not sent. Fill in: PTO hours')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(ptoBox()).toHaveFocus())
    expect(ptoBox()).toHaveAttribute('aria-invalid', 'true')
  })

  it('stays open with the message on a page without the boxes', async () => {
    render(<WorkOrder withMeters={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open share' }))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Generate Public Link' }))
    })
    expect(toast.error).toHaveBeenCalledWith('Not sent. Fill in: PTO hours')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('sending the invoice', () => {
  it('stops at the first refusal, then closes and puts the cursor in the box', async () => {
    render(<WorkOrder />)
    fireEvent.click(screen.getByRole('button', { name: 'Open send' }))
    // Email is ticked for the customer's address; text is ticked as well.
    await act(async () => {
      fireEvent.click(await screen.findByRole('checkbox', { name: /Text message|SMS/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    // Every channel asks the same of the same invoice: not tried, not said twice.
    expect(sendInvoiceLink).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(ptoBox()).toHaveFocus())
  })

  it('waits for the sending to finish before it closes', async () => {
    let answer: (value: unknown) => void = () => undefined
    sendEmail.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    render(<WorkOrder />)
    fireEvent.click(screen.getByRole('button', { name: 'Open send' }))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    })
    // Still sending: the dialog is open and the box has not been touched.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(ptoBox()).not.toHaveAttribute('aria-invalid')
    await act(async () => answer(REFUSED))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(ptoBox()).toHaveFocus())
  })

  it('only marks the box when the person closed the dialog while it was sending', async () => {
    let answer: (value: unknown) => void = () => undefined
    sendEmail.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    render(
      <>
        <textarea aria-label="Notes" />
        <WorkOrder />
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open send' }))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    })
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const notes = screen.getByRole('textbox', { name: 'Notes' })
    notes.focus()
    await act(async () => answer(REFUSED))
    expect(ptoBox()).toHaveAttribute('aria-invalid', 'true')
    expect(notes).toHaveFocus()
  })
})
