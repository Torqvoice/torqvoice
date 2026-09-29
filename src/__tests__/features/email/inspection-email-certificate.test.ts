/**
 * The certificate a customer gets by email is the one they would download.
 *
 * The inspection mail used to render the built-in sheet on its own, so a
 * workshop that had designed its certificate sent one look by email and
 * another through the share link. It now attaches what the shared customer
 * builder returns: the design when there is one, the built-in sheet otherwise.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const inspection = { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) }
vi.mock('@/lib/db', () => ({
  db: {
    inspection,
    appSetting: { findMany: vi.fn().mockResolvedValue([]) },
    organization: { findUnique: vi.fn().mockResolvedValue({ name: 'Egeland Auto' }) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Bernt' }) },
  },
}))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org', userId: 'user' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('@/lib/features', () => ({ requireFeature: vi.fn() }))
vi.mock('@/lib/demo', () => ({ demoGuard: vi.fn() }))
vi.mock('@/lib/document-lock.server', () => ({ markInvoiceSent: vi.fn(), markQuoteSent: vi.fn() }))
vi.mock('@/features/invoices/Lib/issueInvoice', () => ({ issueInvoice: vi.fn() }))
vi.mock('@/features/invoices/Lib/assembleInvoicePrint', () => ({
  assembleInvoicePrint: vi.fn(),
  invoiceNumberOf: vi.fn(),
}))
vi.mock('@/features/invoices/Pdf/buildInvoicePdfBuffer', () => ({ renderInvoicePdf: vi.fn() }))
vi.mock('@/features/quotes/Pdf/buildQuotePdfBuffer', () => ({ buildQuotePdfBuffer: vi.fn() }))
vi.mock('@/i18n/locale-from-request', () => ({
  resolveCustomerLocale: vi.fn().mockResolvedValue('nb'),
}))
vi.mock('@/lib/app-url', () => ({ getAppBaseUrl: () => 'https://app.example' }))

const buildCustomerCertificatePdf = vi.fn()
vi.mock('@/features/inspections/Pdf/customerCertificatePdf', () => ({
  buildCustomerCertificatePdf: (input: unknown) => buildCustomerCertificatePdf(input),
  linkedCertificateAttachment: vi.fn(),
}))
const sendTemplatedMail = vi.fn()
vi.mock('@/features/email/Lib/sendTemplatedMail', () => ({
  sendTemplatedMail: (org: string, options: unknown) => sendTemplatedMail(org, options),
}))

const { sendInspectionEmail } = await import('@/features/email/Actions/emailActions')

beforeEach(() => {
  vi.clearAllMocks()
  inspection.findFirst.mockResolvedValue({
    publicToken: null,
    vehicle: {
      make: 'BMW',
      model: '5-Serie F11',
      year: 2011,
      vin: null,
      licensePlate: 'BS48364',
      hsn: null,
      tsn: null,
      mileage: 0,
      customer: { name: 'Ola', email: 'ola@example.com', phone: null },
    },
  })
})

describe('the inspection email', () => {
  it('attaches the certificate the download gives, in the mail’s language', async () => {
    const designed = new TextEncoder().encode('%PDF designed').buffer
    buildCustomerCertificatePdf.mockResolvedValue({ body: designed, fileName: 'ignored.pdf' })

    const result = await sendInspectionEmail({
      inspectionId: 'insp',
      recipientEmail: 'ola@example.com',
      attachPdf: true,
    })

    expect(result.success).toBe(true)
    expect(buildCustomerCertificatePdf).toHaveBeenCalledWith({
      inspectionId: 'insp',
      organizationId: 'org',
      locale: 'nb',
    })
    const [, options] = sendTemplatedMail.mock.calls[0]
    expect(options.locale).toBe('nb')
    expect(options.attached).toBe(true)
    expect(options.attachments).toHaveLength(1)
    // The file keeps the name the mail has always given it.
    expect(options.attachments[0].filename).toBe('Inspection-2011 BMW 5-Serie F11.pdf')
    expect(options.attachments[0].content.toString()).toBe('%PDF designed')
  })

  it('builds nothing for a link-only mail, and mints the link', async () => {
    const result = await sendInspectionEmail({
      inspectionId: 'insp',
      recipientEmail: 'ola@example.com',
      attachPdf: false,
    })
    expect(result.success).toBe(true)
    expect(buildCustomerCertificatePdf).not.toHaveBeenCalled()
    const [, options] = sendTemplatedMail.mock.calls[0]
    expect(options.attachments).toBeUndefined()
    expect(options.context.shareLink).toMatch(/^https:\/\/app\.example\/share\/inspection\/org\//)
  })

  it('sends nothing when the certificate cannot be built', async () => {
    buildCustomerCertificatePdf.mockResolvedValue(null)
    const result = await sendInspectionEmail({
      inspectionId: 'insp',
      recipientEmail: 'ola@example.com',
      attachPdf: true,
    })
    expect(result.success).toBe(false)
    expect(sendTemplatedMail).not.toHaveBeenCalled()
  })
})
