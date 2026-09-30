import { Document } from '@react-pdf/renderer'
import {
  buildWorkOrderPrintSpec,
  type WorkOrderPrintInput,
} from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import { SpecPdfPage } from '@/features/invoice-designer/Pdf/SpecPdf'

/**
 * The printed work order: the same document pipeline as the invoice, fed
 * the job while it is still open. One sheet, no appended files: the
 * photographs and reports belong to the invoice's copy, and a work order is
 * for signing at the counter and pinning to the board.
 */
export function WorkOrderPDF(input: WorkOrderPrintInput) {
  const spec = buildWorkOrderPrintSpec(input)
  return (
    <Document>
      <SpecPdfPage spec={spec} />
    </Document>
  )
}
