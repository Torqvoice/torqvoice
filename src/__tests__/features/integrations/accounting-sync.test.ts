import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { issuedAtOf } from '@/features/integrations/Lib/accounting-sync'

const base = {
  issuedAt: null,
  sentAt: null,
  manuallyPaid: false,
  payments: [] as { date: Date }[],
  invoiceDate: new Date('2026-05-02T00:00:00Z'),
  serviceDate: new Date('2026-05-01T00:00:00Z'),
}

describe('issuedAtOf', () => {
  it('is null for a draft nobody has seen', () => {
    expect(issuedAtOf(base)).toBeNull()
  })

  it('prefers the issue stamp when there is one', () => {
    const issuedAt = new Date('2026-06-01T10:00:00Z')
    const sentAt = new Date('2026-05-20T10:00:00Z')
    expect(issuedAtOf({ ...base, issuedAt, sentAt })).toBe(issuedAt)
  })

  it('counts an invoice sent before stamps existed as issued when it was sent', () => {
    const sentAt = new Date('2026-05-20T10:00:00Z')
    expect(issuedAtOf({ ...base, sentAt })).toBe(sentAt)
  })

  it('dates a paid legacy invoice by its first payment', () => {
    const first = new Date('2026-05-10T00:00:00Z')
    const payments = [{ date: first }, { date: new Date('2026-05-15T00:00:00Z') }]
    expect(issuedAtOf({ ...base, payments })).toBe(first)
  })

  it('dates one marked paid by hand by the sheet, or the work without a sheet date', () => {
    expect(issuedAtOf({ ...base, manuallyPaid: true })).toEqual(base.invoiceDate)
    expect(issuedAtOf({ ...base, manuallyPaid: true, invoiceDate: null })).toEqual(base.serviceDate)
  })
})
