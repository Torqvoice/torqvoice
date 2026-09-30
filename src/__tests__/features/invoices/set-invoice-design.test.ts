/**
 * Choosing a design on an invoice has to show on the sheet.
 *
 * Sharing a link issues the invoice, and an issued invoice prints from the
 * look it was frozen with. The picker used to save the choice and leave that
 * frozen look alone, so on an invoice that still took new labor lines a
 * design pick did nothing anyone could see. The pick now moves the frozen
 * look too, and a locked invoice refuses it like any other edit.
 */

import { it, expect, vi, beforeEach } from 'vitest'

const serviceRecord = { findFirst: vi.fn(), update: vi.fn() }
const documentDesign = { findFirst: vi.fn() }
vi.mock('@/lib/db', () => ({ db: { serviceRecord, documentDesign } }))

vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; isAdmin: boolean }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org-1', isAdmin: false }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const assertInvoiceEditable = vi.fn()
vi.mock('@/lib/document-lock.server', () => ({
  assertInvoiceEditable: (...args: unknown[]) => assertInvoiceEditable(...args),
}))

const reapplyDesign = vi.fn()
vi.mock('@/features/invoices/Lib/reapplyDesign', () => ({
  ISSUED_WHERE: vi.fn(),
  issuedDesignState: vi.fn(),
  reapplyDesign: (...args: unknown[]) => reapplyDesign(...args),
}))

const { setInvoiceDesign } = await import('@/features/invoices/Actions/invoiceDesignActions')

beforeEach(() => {
  vi.clearAllMocks()
  assertInvoiceEditable.mockResolvedValue(undefined)
  serviceRecord.findFirst.mockResolvedValue({ id: 'rec-1', vehicleId: 'veh-1' })
  serviceRecord.update.mockResolvedValue({})
  documentDesign.findFirst.mockResolvedValue({ id: 'design-2' })
  reapplyDesign.mockResolvedValue(1)
})

it('moves the frozen look to the chosen design, after saving the choice', async () => {
  const result = await setInvoiceDesign('rec-1', 'design-2')

  expect(result.success).toBe(true)
  expect(reapplyDesign).toHaveBeenCalledWith('org-1', ['rec-1'], 'design-2')
  // Following the default is resolved from the saved choice, so the write
  // has to land first.
  expect(serviceRecord.update.mock.invocationCallOrder[0]).toBeLessThan(
    reapplyDesign.mock.invocationCallOrder[0] as number
  )
})

it('goes back to the default look when the choice is cleared', async () => {
  await setInvoiceDesign('rec-1', null)

  expect(serviceRecord.update).toHaveBeenCalledWith({
    where: { id: 'rec-1' },
    data: { designId: null },
  })
  expect(reapplyDesign).toHaveBeenCalledWith('org-1', ['rec-1'], null)
})

it('leaves a locked invoice alone', async () => {
  assertInvoiceEditable.mockRejectedValue(new Error('Invoice is locked'))

  const result = await setInvoiceDesign('rec-1', 'design-2')

  expect(result.success).toBe(false)
  expect(serviceRecord.update).not.toHaveBeenCalled()
  expect(reapplyDesign).not.toHaveBeenCalled()
})
