import { Document } from '@react-pdf/renderer'
import { SpecPdfPage } from '@/features/invoice-designer/Pdf/SpecPdf'
import { buildCertificatePrintSpec, type CertificatePrintInput } from '../Pdf/buildCertificatePrint'

/**
 * The designed certificate: the same document pipeline as the invoice and
 * the quote, fed a completed inspection. The workshop's certificate design,
 * hand placements and section styling all apply, so the certificate a
 * customer receives is the sheet the designer shows.
 */
export function CertificatePDF(input: CertificatePrintInput) {
  const spec = buildCertificatePrintSpec(input)
  return (
    <Document>
      <SpecPdfPage spec={spec} />
    </Document>
  )
}
