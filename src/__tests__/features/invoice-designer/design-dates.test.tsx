import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { InvoiceDesigner } from '@/features/invoice-designer/Components/InvoiceDesigner'
import { InvoiceDesignMenu } from '@/features/vehicles/Components/service-page/InvoiceDesignMenu'
import type { DesignerTemplate } from '@/features/invoice-designer/Components/types'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { DateSettingsProvider } from '@/components/date-settings-context'
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { getDefaultInvoiceLayout } from '@/features/settings/Schema/invoiceLayoutSchema'

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
vi.mock('@/features/invoices/Actions/invoiceDesignActions', () => ({
  getIssuedDesignState: vi.fn(async () => ({
    success: true,
    data: {
      issuedAt: '2026-11-08T23:30:00.000Z',
      followsDefault: true,
      matchedDesignId: null,
      unknown: false,
      designs: [],
    },
  })),
  reapplyDesignToInvoice: vi.fn(),
  refreshIssuedInvoice: vi.fn(),
}))

/**
 * Dates about designs are written the way the workshop writes dates, in its
 * own time zone, like every other date in the app. The design menu on a sent
 * invoice and the saved designs in the gallery used the browser's locale, so
 * a workshop in Oslo with an American browser read "11/8/2026" for a design
 * sent there on the 9th.
 */

// 23:30 UTC on 8 November is 00:30 on 9 November in Oslo.
const OSLO = { dateFormat: 'dd.MM.yyyy', timezone: 'Europe/Oslo' }

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

describe('dates about designs, in the workshop format', () => {
  it('shows when a saved design was saved in the workshop date format and zone', () => {
    render(
      <DateSettingsProvider {...OSLO}>
        <ConfirmProvider>
          <InvoiceDesigner
            initialDocumentType="invoice"
            initialView="gallery"
            invoiceTemplate={template}
            quoteTemplate={template}
            initialSavedDesigns={[
              {
                id: 'd1',
                name: 'Fleet statement',
                documentType: 'invoice',
                savedAt: '2026-11-08T23:30:00.000Z',
                layout: getDefaultInvoiceLayout(),
                template,
                autoRule: null,
              },
            ]}
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
    expect(screen.getByText('Saved 09.11.2026')).toBeInTheDocument()
  })

  it('says when a sent invoice went out in the workshop date format and zone', async () => {
    render(
      <DateSettingsProvider {...OSLO}>
        <ConfirmProvider>
          <DropdownMenu open>
            <DropdownMenuContent>
              <InvoiceDesignMenu recordId="r1" designFollowsName={null} />
            </DropdownMenuContent>
          </DropdownMenu>
        </ConfirmProvider>
      </DateSettingsProvider>
    )
    const trigger = screen.getByRole('menuitem', { name: /invoice design/i })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowRight' })
    expect(await screen.findByText(/^Sent to the customer on 09\.11\.2026,/)).toBeInTheDocument()
  })
})
