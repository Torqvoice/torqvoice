/**
 * The designer's section rail and a section's field list from the keyboard.
 * A section is reached with Tab and selected with Enter; a section or a
 * field moves with the arrow keys on its grip, or Alt with an arrow from
 * anywhere in its row, the way the email designer's rail works. Dragging
 * with a mouse was the only way to do either.
 */
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoiceDesigner } from '@/features/invoice-designer/Components/InvoiceDesigner'
import type { DesignerTemplate } from '@/features/invoice-designer/Components/types'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { DateSettingsProvider } from '@/components/date-settings-context'

const noop = () => undefined
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))
vi.mock('@/features/settings/Actions/settingsActions', () => ({ setSettings: vi.fn() }))
vi.mock('@/features/settings/Actions/invoiceLayoutActions', () => ({
  saveInvoiceLayoutConfig: vi.fn(),
  saveQuoteLayoutConfig: vi.fn(),
  saveCertificateLayoutConfig: vi.fn(),
  saveWorkOrderLayoutConfig: vi.fn(),
}))
vi.mock('@/features/invoice-designer/Actions/documentDesignActions', () => ({
  saveDocumentDesign: vi.fn(),
  getDocumentDesignUsage: vi.fn(),
  deleteDocumentDesign: vi.fn(),
  applyDocumentDesign: vi.fn(),
  setDocumentDesignRule: vi.fn(),
}))

const template: DesignerTemplate = {
  primaryColor: '#475569',
  fontFamily: 'Helvetica',
  headerStyle: 'compact',
  logoSize: 100,
  logoUrl: '',
  backgroundColor: '',
  textColor: '',
  companyTextColor: '',
  frameBorderColor: '',
  frameShadow: 'true',
  frameRadius: 0,
  frameSide: 'left',
}

const renderDesigner = () =>
  render(
    <DateSettingsProvider dateFormat="yyyy-MM-dd" timezone="UTC">
      <ConfirmProvider>
        <InvoiceDesigner
          initialDocumentType="invoice"
          initialView="designer"
          invoiceTemplate={template}
          quoteTemplate={template}
          initialSavedDesigns={[]}
          workshop={{
            name: 'Fjord Bil',
            address: '',
            phone: '',
            email: '',
            slogan: '',
            orgNumber: '',
            paymentTerms: '',
            logoUrl: '',
          }}
          customFields={[]}
        />
      </ConfirmProvider>
    </DateSettingsProvider>
  )

/** The rail's sections in the order it lists them. */
const railOrder = () =>
  screen
    .getAllByTestId(/^rail-(?!eye-|column-)/)
    .map((row) => row.getAttribute('data-testid')?.slice('rail-'.length))

/** A section's fields in the order the inspector lists them. */
const fieldOrder = () =>
  screen
    .getAllByTestId(/^field-row-/)
    .map((row) => row.getAttribute('data-testid')?.slice('field-row-'.length))

async function tabTo(user: ReturnType<typeof userEvent.setup>, target: () => HTMLElement) {
  for (let i = 0; i < 120; i++) {
    if (document.activeElement === target()) return
    await user.tab()
  }
  throw new Error('never reached by Tab')
}

// Tab walks through the whole designer one stop at a time; under a full run
// that takes longer than the default five seconds.
vi.setConfig({ testTimeout: 30000 })

describe('the designer rail from the keyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selects a section with Enter and moves it with the arrow keys', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()
    const customer = () => within(screen.getByTestId('rail-customer'))

    await tabTo(user, () => customer().getByRole('button', { name: 'Customer' }))
    await user.keyboard('{Enter}')
    expect(customer().getByRole('button', { name: 'Customer' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    // The inspector opens on the section chosen.
    expect(screen.getAllByTestId(/^field-row-/).length).toBeGreaterThan(0)

    const before = railOrder()
    const at = before.indexOf('customer')
    expect(at).toBeGreaterThan(0)

    // Alt with an arrow from the name moves the section up past its neighbour.
    await act(async () => {
      await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    })
    const up = [...before]
    up.splice(at, 1)
    up.splice(at - 1, 0, 'customer')
    expect(railOrder()).toEqual(up)

    // The grip moves it with the arrows alone, and keeps the focus.
    const grip = customer().getByRole('button', {
      name: 'Drag, or use the arrow keys, to move Customer',
    })
    await user.tab({ shift: true })
    expect(grip).toHaveFocus()
    await act(async () => {
      await user.keyboard('{ArrowDown}')
    })
    expect(railOrder()).toEqual(before)
    expect(grip).toHaveFocus()
  })

  it("moves a section's field with the arrow keys on its grip", async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()
    const customer = within(screen.getByTestId('rail-customer'))

    await tabTo(user, () => customer.getByRole('button', { name: 'Customer' }))
    await user.keyboard('{Enter}')

    const before = fieldOrder()
    const first = before[0] as string
    const row = within(screen.getByTestId(`field-row-${first}`))
    const grip = row.getByRole('button', { name: /^Drag, or use the arrow keys, to move / })
    await tabTo(user, () => grip)
    await act(async () => {
      await user.keyboard('{ArrowDown}')
    })

    const after = fieldOrder()
    expect(after[1]).toBe(first)
    expect(after[0]).toBe(before[1])
    expect(grip).toHaveFocus()
  })
})
