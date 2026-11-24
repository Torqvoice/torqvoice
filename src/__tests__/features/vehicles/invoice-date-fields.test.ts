/**
 * The work order's invoice date fields, in a workshop in Auckland.
 *
 * A draft shows only the dates somebody set, so a save of the form can never
 * store a date the issue would then take for a person's choice. An issued
 * invoice, and one sent or paid before issuing tracked it, shows the dates
 * it went out with.
 */
import { describe, expect, it } from 'vitest'
import { invoiceDateFields } from '@/features/vehicles/Lib/invoiceDateFields'

const opts = { timeZone: 'Pacific/Auckland', dueDays: 14 }
// 2 September in Auckland (UTC+12).
const OPENED = new Date('2026-09-02T00:30:00Z')

const job = (over: Record<string, unknown> = {}) => ({
  issuedAt: null,
  sentAt: null,
  manuallyPaid: false,
  payments: [],
  invoiceDate: null,
  invoiceDueDate: null,
  startDateTime: OPENED,
  serviceDate: OPENED,
  ...over,
})

describe('a draft', () => {
  it('leaves both dates for the issue', () => {
    expect(invoiceDateFields(job(), opts)).toEqual({
      invoiceDate: '',
      invoiceDueDate: '',
      invoiceDatedOnIssue: true,
      invoiceDueDatedOnIssue: true,
    })
  })

  it('leaves the due date for the issue even with a typed invoice date', () => {
    const fields = invoiceDateFields(job({ invoiceDate: new Date('2026-11-09T11:00:00Z') }), opts)
    expect(fields.invoiceDate).toBe('2026-11-10')
    expect(fields.invoiceDueDate).toBe('')
    expect(fields.invoiceDatedOnIssue).toBe(false)
    expect(fields.invoiceDueDatedOnIssue).toBe(true)
  })

  it('shows a due date somebody set', () => {
    const fields = invoiceDateFields(
      job({ invoiceDueDate: new Date('2026-12-24T11:00:00Z') }),
      opts
    )
    expect(fields.invoiceDueDate).toBe('2026-12-25')
  })
})

describe('an invoice sent or paid before issuing tracked it', () => {
  it.each([
    ['sent', { sentAt: new Date('2026-09-05T01:00:00Z') }],
    ['marked paid', { manuallyPaid: true }],
    ['paid', { payments: [{ amount: 100 }] }],
  ])('shows the dates it went out with when %s', (_, over) => {
    expect(invoiceDateFields(job(over), opts)).toEqual({
      invoiceDate: '2026-09-02',
      invoiceDueDate: '2026-09-16',
      invoiceDatedOnIssue: false,
      invoiceDueDatedOnIssue: false,
    })
  })
})

describe('an issued invoice', () => {
  it('shows its stored dates', () => {
    const fields = invoiceDateFields(
      job({
        issuedAt: new Date('2026-11-17T12:30:00Z'),
        invoiceDate: new Date('2026-11-17T11:00:00Z'),
        invoiceDueDate: new Date('2026-12-01T11:00:00Z'),
      }),
      opts
    )
    expect(fields).toEqual({
      invoiceDate: '2026-11-18',
      invoiceDueDate: '2026-12-02',
      invoiceDatedOnIssue: false,
      invoiceDueDatedOnIssue: false,
    })
  })
})
