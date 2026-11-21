/**
 * A hidden section in the designer's rail. Its eye is the one thing to click
 * to bring the section back, so it is drawn as strongly as a shown section's
 * eye; the section reads as hidden from its greyed name and the crossed eye.
 * The whole row used to be faded, which left the eye too faint to find on a
 * light screen.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

/** How far a grey is from white, as WCAG measures it. */
function contrastOnWhite(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05)
}

const hex = (rgb: string) =>
  `#${(rgb.match(/\d+/g) ?? []).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`

describe('a hidden section in the designer rail', () => {
  it('keeps its eye easy to see', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()
    const eye = screen.getByTestId('rail-eye-customer')
    expect(eye).toHaveAttribute('aria-pressed', 'true')

    await user.click(eye)

    expect(eye).toHaveAttribute('aria-pressed', 'false')
    // Nothing fades the row the eye sits in.
    expect(screen.getByTestId('rail-customer').style.opacity).toBe('')
    // A control has to stand 3:1 off its background to be found.
    expect(contrastOnWhite(hex(eye.style.color))).toBeGreaterThanOrEqual(3)
  })

  it('greys the name of the hidden section, still readable', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()
    const name = () => screen.getByRole('button', { name: 'Customer' })
    expect(name().style.color).toBe('')

    await user.click(screen.getByTestId('rail-eye-customer'))

    expect(contrastOnWhite(hex(name().style.color))).toBeGreaterThanOrEqual(4.5)
  })
})
