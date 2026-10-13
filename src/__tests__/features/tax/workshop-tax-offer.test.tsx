/**
 * Putting an older job on the workshop's tax.
 *
 * A work order or quote keeps the rate it was created with. One written
 * before the workshop turned tax on shows no tax, and used to leave the desk
 * with a job that could only be fixed by knowing where to type a rate, or by
 * deleting it and starting again. These tests pin when the page offers the
 * workshop's rate, what taking the offer writes, and that a job with no rate
 * does not show a tax switch on its lines.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/document-lock.server', () => ({
  assertQuoteEditable: vi.fn().mockResolvedValue(undefined),
  assertInvoiceEditable: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/features/vehicles/Lib/retotalServiceRecord', () => ({
  retotalServiceRecord: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    serviceRecord: { findFirst: vi.fn() },
    quote: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { applyWorkshopTaxToDocument } from '@/features/settings/Actions/applyWorkshopTaxToDocument'
import { LineTaxProvider } from '@/features/settings/Components/LineTaxContext'
import { LineTaxToggle } from '@/features/settings/Components/LineTaxToggle'
import {
  WorkshopTaxOfferPrompt,
  WorkshopTaxOfferProvider,
} from '@/features/settings/Components/WorkshopTaxOffer'
import { taxOfferFor, workshopTaxOffer } from '@/features/settings/Lib/workshopTaxOffer'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { assertInvoiceEditable } from '@/lib/document-lock.server'
import { DocumentLockedError } from '@/lib/document-lock'

const TAX_ON = [
  { key: 'workshop.taxEnabled', value: 'true' },
  { key: 'workshop.defaultTaxRate', value: '25' },
]
const PARTS_ONLY = [
  ...TAX_ON,
  { key: 'workshop.taxSelective', value: 'true' },
  { key: 'workshop.taxAppliesToLabor', value: 'false' },
]

function settings(rows: { key: string; value: string }[]) {
  vi.mocked(db.appSetting.findMany).mockImplementation((async (args: {
    where?: { key?: { in?: string[] } }
  }) => {
    const wanted = args?.where?.key?.in
    return wanted ? rows.filter((r) => wanted.includes(r.key)) : rows
  }) as never)
}

const openJob = {
  taxRate: 0,
  status: 'pending',
  sentAt: null,
  issuedAt: null,
  customer: null,
  vehicle: { customer: { taxExempt: false } },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'a@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-1',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  settings(TAX_ON)
})

describe('when the offer is made', () => {
  const tax = { enabled: true, rate: 25 }
  const doc = { taxRate: 0, customerExempt: false, settled: false }

  it('is made to an open job with no tax in a workshop that charges it', () => {
    expect(taxOfferFor(tax, doc)).toEqual({ rate: 25, currentRate: 0 })
  })

  it('is made to a job at another rate than the workshop charges now', () => {
    expect(taxOfferFor(tax, { ...doc, taxRate: 20 })).toEqual({ rate: 25, currentRate: 20 })
  })

  it('is not made when the job already carries the workshop rate', () => {
    expect(taxOfferFor(tax, { ...doc, taxRate: 25 })).toBeNull()
    expect(taxOfferFor(tax, { ...doc, taxRate: 25.0000001 })).toBeNull()
  })

  it('is not made by a workshop that charges no tax', () => {
    expect(taxOfferFor({ enabled: false, rate: 25 }, doc)).toBeNull()
    expect(taxOfferFor({ enabled: true, rate: 0 }, doc)).toBeNull()
  })

  it('is not made for an exempt customer, whose 0% is deliberate', () => {
    expect(taxOfferFor(tax, { ...doc, customerExempt: true })).toBeNull()
  })

  it('is not made once the job is finished or has gone to the customer', () => {
    expect(taxOfferFor(tax, { ...doc, settled: true })).toBeNull()
  })
})

describe('the offer for a stored document', () => {
  it('is made to an open, unsent work order', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(openJob as never)
    expect(await workshopTaxOffer('org-1', 'workOrder', 'sr-1')).toEqual({
      rate: 25,
      currentRate: 0,
    })
  })

  it.each([
    ['completed', { status: 'completed' }],
    ['sent to the customer', { sentAt: new Date() }],
    ['issued', { issuedAt: new Date() }],
    ['for an exempt customer', { vehicle: { customer: { taxExempt: true } } }],
    ['a counter sale to an exempt customer', { vehicle: null, customer: { taxExempt: true } }],
  ])('is not made to a work order that is %s', async (_name, change) => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({ ...openJob, ...change } as never)
    expect(await workshopTaxOffer('org-1', 'workOrder', 'sr-1')).toBeNull()
  })

  it('is made to a draft quote and to no other', async () => {
    const draft = { taxRate: 0, status: 'draft', sentAt: null, customer: null }
    vi.mocked(db.quote.findFirst).mockResolvedValue(draft as never)
    expect(await workshopTaxOffer('org-1', 'quote', 'q-1')).toEqual({ rate: 25, currentRate: 0 })
    for (const status of ['sent', 'accepted', 'converted', 'rejected']) {
      vi.mocked(db.quote.findFirst).mockResolvedValue({ ...draft, status } as never)
      expect(await workshopTaxOffer('org-1', 'quote', 'q-1'), status).toBeNull()
    }
    vi.mocked(db.quote.findFirst).mockResolvedValue({ ...draft, sentAt: new Date() } as never)
    expect(await workshopTaxOffer('org-1', 'quote', 'q-1')).toBeNull()
  })

  it('is not made for a document that is not this workshop’s', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null)
    expect(await workshopTaxOffer('org-1', 'workOrder', 'someone-elses')).toBeNull()
    expect(db.serviceRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'someone-elses', organizationId: 'org-1' } })
    )
  })
})

describe('taking the offer on a work order', () => {
  function transaction() {
    const tx = {
      servicePart: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      serviceLabor: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      serviceRecord: { update: vi.fn().mockResolvedValue({}) },
    }
    vi.mocked(db.$transaction).mockImplementation((async (run: (t: typeof tx) => unknown) =>
      run(tx)) as never)
    return tx
  }

  it('writes the workshop rate and re-totals the job from its lines', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(openJob as never)
    const tx = transaction()

    const result = await applyWorkshopTaxToDocument({ kind: 'workOrder', id: 'sr-1' })

    expect(result).toMatchObject({ success: true, data: { id: 'sr-1', rate: 25 } })
    expect(tx.serviceRecord.update).toHaveBeenCalledWith({
      where: { id: 'sr-1' },
      data: expect.objectContaining({ taxRate: 25 }),
    })
    expect(retotalServiceRecord).toHaveBeenCalledWith('sr-1', tx)
    // The rate is on the row before the job is totalled under it.
    expect(tx.serviceRecord.update.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(retotalServiceRecord).mock.invocationCallOrder[0]
    )
  })

  it('puts the lines of a job that had no tax on the workshop rule for each kind', async () => {
    settings(PARTS_ONLY)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(openJob as never)
    const tx = transaction()

    await applyWorkshopTaxToDocument({ kind: 'workOrder', id: 'sr-1' })

    expect(tx.servicePart.updateMany).toHaveBeenCalledWith({
      where: { serviceRecordId: 'sr-1' },
      data: { taxable: true },
    })
    expect(tx.serviceLabor.updateMany).toHaveBeenCalledWith({
      where: { serviceRecordId: 'sr-1', pricingType: { not: 'shopFee' } },
      data: { taxable: false },
    })
    expect(tx.serviceLabor.updateMany).toHaveBeenCalledWith({
      where: { serviceRecordId: 'sr-1', pricingType: 'shopFee' },
      data: { taxable: true },
    })
  })

  it('leaves the lines alone on a job moving from one rate to another', async () => {
    settings(PARTS_ONLY)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({ ...openJob, taxRate: 20 } as never)
    const tx = transaction()

    await applyWorkshopTaxToDocument({ kind: 'workOrder', id: 'sr-1' })

    expect(tx.servicePart.updateMany).not.toHaveBeenCalled()
    expect(tx.serviceLabor.updateMany).not.toHaveBeenCalled()
    expect(tx.serviceRecord.update).toHaveBeenCalled()
  })

  it('gives the job the split when the workshop charges two taxes', async () => {
    settings([
      ...TAX_ON.filter((s) => s.key !== 'workshop.defaultTaxRate'),
      { key: 'workshop.defaultTaxRate', value: '14.975' },
      { key: 'workshop.taxMode', value: 'split' },
      {
        key: 'workshop.taxComponents',
        value: JSON.stringify([
          { name: 'GST', rate: 5 },
          { name: 'QST', rate: 9.975 },
        ]),
      },
    ])
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(openJob as never)
    const tx = transaction()

    await applyWorkshopTaxToDocument({ kind: 'workOrder', id: 'sr-1' })

    const { data } = tx.serviceRecord.update.mock.calls[0][0]
    expect(data.taxRate).toBe(14.975)
    expect(data.taxComponents).toEqual([
      { name: 'GST', rate: 5, amount: 0 },
      { name: 'QST', rate: 9.975, amount: 0 },
    ])
  })

  it('is refused for a job that was sent since the page was opened', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...openJob,
      sentAt: new Date(),
    } as never)
    transaction()

    const result = await applyWorkshopTaxToDocument({ kind: 'workOrder', id: 'sr-1' })

    expect(result.success).toBe(false)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('is refused for a locked invoice before anything is read', async () => {
    vi.mocked(assertInvoiceEditable).mockRejectedValue(new DocumentLockedError('sent'))
    const result = await applyWorkshopTaxToDocument({ kind: 'workOrder', id: 'sr-1' })
    expect(result.success).toBe(false)
    expect(db.serviceRecord.findFirst).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe('taking the offer on a quote', () => {
  it('totals the quote under the workshop rate, on the lines the customer kept', async () => {
    settings(PARTS_ONLY)
    vi.mocked(db.quote.findFirst).mockResolvedValue({
      taxRate: 0,
      status: 'draft',
      sentAt: null,
      customer: null,
    } as never)
    const update = vi.fn().mockResolvedValue({})
    const tx = {
      quotePart: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      quoteLabor: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      quote: {
        update,
        // As the lines stand after the rule was put on them: parts taxed, labor not.
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          subtotal: 500,
          discountAmount: 0,
          taxInclusive: false,
          partItems: [
            { total: 200, taxable: true, excluded: false },
            { total: 400, taxable: true, excluded: true },
          ],
          laborItems: [{ total: 300, taxable: false, excluded: false, pricingType: 'hourly' }],
        }),
      },
    }
    vi.mocked(db.$transaction).mockImplementation((async (run: (t: typeof tx) => unknown) =>
      run(tx)) as never)

    const result = await applyWorkshopTaxToDocument({ kind: 'quote', id: 'q-1' })

    expect(result.success).toBe(true)
    expect(tx.quoteLabor.updateMany).toHaveBeenCalledWith({
      where: { quoteId: 'q-1', pricingType: { not: 'shopFee' } },
      data: { taxable: false },
    })
    // 25% of the 200 of parts the customer kept.
    expect(update.mock.calls[0][0].data).toMatchObject({
      taxRate: 25,
      taxableSubtotal: 200,
      taxAmount: 50,
      totalAmount: 550,
    })
  })
})

describe('the prompt on the totals card', () => {
  const prompt = (value: Parameters<typeof WorkshopTaxOfferProvider>[0]['value']) =>
    render(
      <WorkshopTaxOfferProvider value={value}>
        <WorkshopTaxOfferPrompt />
      </WorkshopTaxOfferProvider>
    )

  it('is not there without an offer', () => {
    prompt(null)
    expect(screen.queryByTestId('workshop-tax-offer')).toBeNull()
  })

  it('says the job has no tax and offers the workshop rate', () => {
    prompt({ rate: 25, currentRate: 0, apply: vi.fn() })
    const box = screen.getByTestId('workshop-tax-offer')
    expect(box).toHaveTextContent('created without tax')
    expect(screen.getByRole('button', { name: 'Apply 25% tax' })).toBeEnabled()
  })

  it('names the rate the job is at when it has one', () => {
    prompt({ rate: 25, currentRate: 20, apply: vi.fn() })
    expect(screen.getByTestId('workshop-tax-offer')).toHaveTextContent('This is at 20%')
  })

  it('applies on click and cannot be clicked twice while it does', async () => {
    let finish: () => void = () => {}
    const apply = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    prompt({ rate: 25, currentRate: 0, apply })
    const button = screen.getByRole('button', { name: 'Apply 25% tax' })

    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.click(button)
    expect(apply).toHaveBeenCalledTimes(1)

    finish()
    await waitFor(() => expect(button).toBeEnabled())
  })
})

describe('the tax switch on a line of a job with no tax rate', () => {
  const all = { parts: true, labor: true, shopFee: true }

  it('is not shown, taxed or untaxed, because it would decide nothing', () => {
    render(
      <LineTaxProvider value={{ selective: true, applies: all, untaxedDocument: true }}>
        <LineTaxToggle taxable onToggle={vi.fn()} />
        <LineTaxToggle taxable={false} onToggle={vi.fn()} />
      </LineTaxProvider>
    )
    expect(screen.queryByTestId('line-tax-toggle')).toBeNull()
  })

  it('is shown again once the job has a rate', () => {
    render(
      <LineTaxProvider value={{ selective: true, applies: all, untaxedDocument: false }}>
        <LineTaxToggle taxable onToggle={vi.fn()} />
      </LineTaxProvider>
    )
    expect(screen.getByTestId('line-tax-toggle')).toBeInTheDocument()
  })
})
