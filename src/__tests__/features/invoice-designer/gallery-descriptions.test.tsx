import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvoiceDesigner } from '@/features/invoice-designer/Components/InvoiceDesigner'
import type { DesignerTemplate } from '@/features/invoice-designer/Components/types'
import { ConfirmProvider } from '@/components/confirm-dialog'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
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

/**
 * The template gallery in the designer describes each template in its own
 * words, as the Templates settings page does. It used to print the line for
 * the template's header style, so Compact and Minimal, and Itemized and
 * Detailed, read exactly the same.
 */

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

describe('the designer template gallery', () => {
  it('describes every template in its own words', () => {
    render(
      <ConfirmProvider>
        <InvoiceDesigner
          initialDocumentType="invoice"
          initialView="gallery"
          invoiceTemplate={template}
          quoteTemplate={template}
          workshop={{
            name: 'Riverside Auto',
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
    )
    for (const description of [
      'Parts and labor in separate tables, details stacked on the left',
      'Contact details along the bottom, title below the addresses',
      'No panels, only the essentials',
      'Bare type on white: no boxes, no bands, just rules and whitespace',
      'One numbered item list with a unit column',
      'Title up top, vehicle on its own, both tables and every optional block',
    ]) {
      expect(screen.getByText(description)).toBeInTheDocument()
    }
    expect(screen.queryByText('Tight header, dense rows')).not.toBeInTheDocument()
    expect(screen.queryByText('Full-width colored banner')).not.toBeInTheDocument()
  })
})
