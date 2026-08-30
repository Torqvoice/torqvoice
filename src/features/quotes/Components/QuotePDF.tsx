import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import {
  buildQuotePrintSpec,
  type QuotePrintData,
} from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { pdfFamily } from '@/features/invoice-designer/Pdf/renderPdf'
import { SpecPdfPage } from '@/features/invoice-designer/Pdf/SpecPdf'
import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
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
  currencyCode = 'USD',
  currencyFormat = 'symbol',
  logoDataUri,
  torqvoiceLogoDataUri,
  dateFormat,
  timezone,
  template,
  portalUrl,
  imageAttachments = [],
  otherAttachments = [],
  pdfAttachmentNames = [],
  customFields = [],
  labels = {},
  layoutConfig,
}: {
  data: QuotePrintData
  workshop?: { name: string; address: string; phone: string; email: string; slogan?: string }
  currencyCode?: string
  currencyFormat?: 'symbol' | 'code'
  logoDataUri?: string
  torqvoiceLogoDataUri?: string
  dateFormat?: string
  timezone?: string
  template?: TemplateConfig
  portalUrl?: string
  imageAttachments?: ImageAttachmentPDF[]
  otherAttachments?: OtherAttachmentPDF[]
  pdfAttachmentNames?: string[]
  customFields?: Array<{ fieldId: string; label: string; value: string; fieldType: string }>
  labels?: Record<string, string>
  layoutConfig?: InvoiceLayoutConfig
}) {
  const spec = buildQuotePrintSpec({
    data,
    workshop,
    currencyCode,
    currencyFormat,
    logoDataUri,
    torqvoiceLogoDataUri,
    dateFormat,
    timezone,
    template,
    portalUrl,
    pdfAttachmentNames,
    otherAttachmentNames: otherAttachments.map((att) => att.fileName),
    customFields,
    labels,
    layoutConfig,
  })

  const quoteNum = data.quoteNumber || 'QUOTE'
  const shopName = workshop?.name || 'Torqvoice'
  const fontFamily = pdfFamily(spec.page.fontFamily)

  return (
    <Document>
      <SpecPdfPage spec={spec} />

      {imageAttachments.length > 0 && (
        <Page size="A4" style={{ padding: 40, fontFamily, fontSize: 9, color: '#111827' }}>
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
          <Text
            fixed
            style={{
              position: 'absolute',
              bottom: 16,
              left: 40,
              right: 40,
              fontSize: 8,
              color: '#6b7280',
              textAlign: 'center',
            }}
          >
            {quoteNum} · {shopName}
          </Text>
        </Page>
      )}
    </Document>
  )
}
