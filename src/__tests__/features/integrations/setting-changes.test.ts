import { describe, expect, it } from 'vitest'
import { effectiveSettings } from '@/features/integrations/Lib/connections'
import { describeSettingChanges } from '@/features/integrations/Lib/setting-changes'
import { manifest as fiken } from '@/integrations/fiken/manifest'
import { vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

/**
 * The settings form sends every field on every save. The log line used to
 * list them all, which told the reader nothing; it now names what changed.
 */
describe('integration setting changes', () => {
  const saved = { companySlug: 'torqvoice-test', pushInvoices: false, zeroVatType: 'NONE' }
  const before = effectiveSettings('fiken', saved)

  it('names each changed setting by its label, with the old and the new value', () => {
    const after = {
      ...before,
      pushInvoices: true,
      laborAccount: '3020',
      zeroVatType: 'EXEMPT',
      zeroAccount: '3100',
      startDate: '2026-10-01',
      manualPaidAsPayment: true,
    }
    expect(describeSettingChanges(fiken, before, after)).toEqual([
      'Send issued invoices to Fiken: off → on',
      'Only invoices dated on or after: empty → 2026-10-01',
      'Income account for labour: empty → 3020',
      'VAT type for invoices without VAT: None (no VAT handling) → Exempt (fritatt)',
      'Income account for invoices without VAT: empty → 3100',
      'Record a payment when an invoice is marked paid by hand: off → on',
    ])
  })

  it('says nothing when a save changed nothing, defaults included', () => {
    // The form sends the defaults back for settings that were never saved.
    const resent = {
      ...before,
      attachPdf: true,
      pushPayments: true,
      startDate: '',
      laborAccount: '',
    }
    expect(describeSettingChanges(fiken, before, resent)).toEqual([])
  })

  it('reports a cleared value as empty', () => {
    expect(
      describeSettingChanges(
        fiken,
        { ...before, paymentAccount: '1920:10001' },
        { paymentAccount: '' }
      )
    ).toEqual(['Deposit payments to: 1920:10001 → empty'])
  })
})
