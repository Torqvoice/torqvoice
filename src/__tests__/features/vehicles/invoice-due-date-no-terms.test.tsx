/**
 * The invoice's due date on a work order, for a workshop with no payment terms.
 *
 * With no terms nothing sets a due date, issued or not, and the field used to
 * stay empty without a word (a draft even promised one "from terms"). Somebody
 * who can change settings is told why and given the way to set them; somebody
 * who cannot is not sent to a page that would turn them away.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'dd/MM/yyyy',
    timeFormat: '24h',
    timezone: 'Pacific/Auckland',
  }),
}))
vi.mock('@/features/invoices/Actions/invoiceDesignActions', () => ({ setInvoiceDesign: vi.fn() }))

import { InvoiceDetailsSection } from '@/features/vehicles/Components/service-edit/InvoiceDetailsSection'

const NO_TERMS_NOTE = 'No payment terms set, so there is no due date.'

function section(opts: {
  paymentTermsDays?: number
  canEditSettings?: boolean
  draft?: boolean
  dueDate?: string
}) {
  const draft = opts.draft ?? false
  return render(
    <InvoiceDetailsSection
      part="invoice"
      initialData={
        {
          id: 'job-1',
          invoiceNumber: '2026-1001',
          invoiceDate: draft ? '' : '2026-11-24',
          invoiceDueDate: opts.dueDate ?? '',
          invoiceDatedOnIssue: draft,
          invoiceDueDatedOnIssue: draft,
        } as never
      }
      type="maintenance"
      setType={vi.fn()}
      status="in-progress"
      setStatus={vi.fn()}
      paymentStatus="unpaid"
      onTogglePaid={vi.fn()}
      paymentTermsDays={opts.paymentTermsDays}
      canEditSettings={opts.canEditSettings}
    />
  )
}

describe('the due date with no payment terms', () => {
  it('says why it is empty and links to the setting, for somebody who can set it', () => {
    section({ paymentTermsDays: 0, canEditSettings: true })

    expect(screen.getByText(NO_TERMS_NOTE)).toBeInTheDocument()
    // Not today's date as an example in the empty field.
    expect(screen.getByPlaceholderText('No due date')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set payment terms' })).toHaveAttribute(
      'href',
      '/settings/invoice#dueDays'
    )
  })

  it('does not promise a due date "from terms" on a draft', () => {
    section({ paymentTermsDays: 0, canEditSettings: true, draft: true })

    expect(screen.queryByPlaceholderText('From terms')).toBeNull()
    expect(screen.queryByText(/set from your payment terms/)).toBeNull()
    expect(screen.getByText(NO_TERMS_NOTE)).toBeInTheDocument()
  })

  it('offers no settings link to somebody who cannot change settings', () => {
    section({ paymentTermsDays: 0, canEditSettings: false })

    expect(screen.queryByText(NO_TERMS_NOTE)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Set payment terms' })).toBeNull()
  })

  it('says nothing once the invoice has a due date of its own', () => {
    section({ paymentTermsDays: 0, canEditSettings: true, dueDate: '2026-12-08' })

    expect(screen.queryByText(NO_TERMS_NOTE)).toBeNull()
  })

  it('says nothing about terms a workshop has set', () => {
    section({ paymentTermsDays: 14, canEditSettings: true, draft: true })

    expect(screen.queryByText(NO_TERMS_NOTE)).toBeNull()
    expect(screen.getByPlaceholderText('From terms')).toBeInTheDocument()
  })
})
