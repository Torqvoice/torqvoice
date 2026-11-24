import { DEFAULT_CURRENCY_CODE } from '@/lib/currencies'
import { Document, Image, Text, View } from '@react-pdf/renderer'
import {
  buildQuotePrintSpec,
  type QuotePrintData,
} from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { SpecPdfPage } from '@/features/invoice-designer/Pdf/SpecPdf'
import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { VisitConditionMap } from '@/features/condition-map/Lib/print'
import type { InspectionResults } from '@/features/inspections/Lib/inspectionResults'
import type { TemplateConfig } from '@/features/vehicles/Components/invoice-pdf/types'

interface ImageAttachmentPDF {
  fileName: string
  dataUri: string
  description?: string
}

interface OtherAttachmentPDF {
  fileName: string
  fileType: string
}

/**
 * The printed quote: the same document pipeline as the invoice, fed a quote.
 * The workshop's saved layout, hand placements and section styling all apply,
 * so the quote a customer receives is the sheet the designer shows.
 */
export function QuotePDF({
  data,
  workshop,
  currencyCode = DEFAULT_CURRENCY_CODE,
  currencyFormat = 'symbol',
  logoDataUri,
  signer,
  torqvoiceLogoDataUri,
  dateFormat,
  timezone,
  unitSystem,
  template,
  portalUrl,
  imageAttachments = [],
  otherAttachments = [],
  pdfAttachmentNames = [],
  customFields = [],
  recordCustomFields = [],
  labels = {},
  locale,
  layoutConfig,
  lineItemsInclTax,
  conditionMap,
  inspectionResults,
}: {
  data: QuotePrintData
  workshop?: { name: string; address: string; phone: string; email: string; slogan?: string }
  currencyCode?: string
  currencyFormat?: 'symbol' | 'code'
  logoDataUri?: string
  signer?: { name: string; dataUri?: string }
  torqvoiceLogoDataUri?: string
  dateFormat?: string
  timezone?: string
  unitSystem?: string
  template?: TemplateConfig
  portalUrl?: string
  imageAttachments?: ImageAttachmentPDF[]
  otherAttachments?: OtherAttachmentPDF[]
  pdfAttachmentNames?: string[]
  customFields?: Array<{ fieldId: string; label: string; value: string; fieldType: string }>
  /** The vehicle's and the customer's own custom fields; printed only where a design places one. */
  recordCustomFields?: Array<{ fieldId: string; label: string; value: string; fieldType: string }>
  labels?: Record<string, string>
  /** The document's language; numbers are written its way. */
  locale?: string
  lineItemsInclTax?: boolean
  layoutConfig?: InvoiceLayoutConfig
  conditionMap?: VisitConditionMap
  inspectionResults?: InspectionResults | null
}) {
  const spec = buildQuotePrintSpec({
    data,
    lineItemsInclTax,
    workshop,
    currencyCode,
    currencyFormat,
    logoDataUri,
    signer,
    torqvoiceLogoDataUri,
    dateFormat,
    timezone,
    unitSystem,
    template,
    portalUrl,
    pdfAttachmentNames,
    otherAttachmentNames: otherAttachments.map((att) => att.fileName),
    customFields,
    recordCustomFields,
    labels,
    locale,
    layoutConfig,
    conditionMap,
    inspectionResults,
  })

  return (
    <Document>
      {/* The pictures follow on the document's own sheets, so they carry the
          same pinned footer as the pages before them instead of a footer
          of their own. */}
      <SpecPdfPage spec={spec}>
        {imageAttachments.length > 0 && (
          <View break>
            <Text style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
              {labels.quoteImages || 'Quote Images'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {imageAttachments.map((img, i) => (
                <View key={i} style={{ width: '48%', marginBottom: 8 }}>
                  <Image
                    src={img.dataUri}
                    style={{
                      maxHeight: 250,
                      borderRadius: 4,
                      objectFit: 'contain',
                      objectPosition: 'left',
                    }}
                  />
                  <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>
                    {img.description || img.fileName}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </SpecPdfPage>
    </Document>
  )
}
