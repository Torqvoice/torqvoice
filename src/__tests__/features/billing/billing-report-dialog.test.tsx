/**
 * The Generate report dialog turns what the billing list shows into a
 * report: printed, or downloaded as PDF, Excel or CSV. It must send the
 * list's own filters and the chosen columns, so the report is the screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const actions = vi.hoisted(() => ({
  getBillingReport: vi.fn(),
  exportBillingReport: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/features/billing/Actions/getBillingReport', () => ({
  getBillingReport: actions.getBillingReport,
}))
vi.mock('@/features/billing/Actions/exportBillingReport', () => ({
  exportBillingReport: actions.exportBillingReport,
}))
vi.mock('sonner', () => ({ toast: { error: actions.toastError, success: vi.fn() } }))

import { BillingReportSheet } from '@/features/billing/Components/BillingReportSheet'
import { GenerateReportDialog } from '@/features/billing/Components/GenerateReportDialog'
import type { BillingReportData } from '@/features/billing/Lib/billingReport.server'
import type { ReportModel } from '@/features/billing/Lib/billingReportModel'

const filters = {
  status: 'unpaid',
  from: '2026-11-01',
  to: '2026-11-30',
  groupBy: 'customer',
  completedOnly: true,
  sortOrder: 'desc' as const,
}

function renderDialog(count = 34) {
  const onOpenChange = vi.fn()
  render(
    <GenerateReportDialog
      open
      onOpenChange={onOpenChange}
      filters={filters}
      columns={['invoice', 'customer', 'balance']}
      count={count}
      description="Unpaid · 01/11/2026 – 30/11/2026"
    />
  )
  return { onOpenChange }
}

const report: BillingReportData = {
  workshop: { name: 'ZZ Test Garage', address: '', phone: '', email: '' },
  filters,
  groupBy: 'customer',
  columns: ['invoice', 'customer', 'balance'],
  timeZone: 'Pacific/Auckland',
  dateFormat: 'dd/MM/yyyy',
  timeFormat: '24h',
  currencyCode: 'GBP',
  currencyFormat: 'symbol',
  generatedAt: '2026-11-20T12:00:00.000Z',
  rows: [],
  truncated: false,
  totals: { count: 0, invoiced: 0, paid: 0, outstanding: 0 },
  groups: [],
}

beforeEach(() => {
  actions.getBillingReport.mockReset()
  actions.exportBillingReport.mockReset()
  actions.toastError.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:report')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  document.querySelectorAll('iframe').forEach((frame) => frame.remove())
})

describe('the Generate report dialog', () => {
  it('says what the report will hold', () => {
    renderDialog()
    expect(screen.getByText('34 invoices: Unpaid · 01/11/2026 – 30/11/2026')).toBeTruthy()
    expect(screen.getByText('3 columns, as chosen in Columns')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Print/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('prints every invoice the list filters keep, in the chosen columns', async () => {
    actions.getBillingReport.mockResolvedValue({ success: true, data: report })
    const { onOpenChange } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(actions.getBillingReport).toHaveBeenCalledWith({
      ...filters,
      columns: ['invoice', 'customer', 'balance'],
      title: undefined,
    })
    expect(actions.exportBillingReport).not.toHaveBeenCalled()
  })

  it('downloads a CSV with the title typed in', async () => {
    actions.exportBillingReport.mockResolvedValue({
      success: true,
      data: { fileName: 'debtors.csv', mimeType: 'text/csv', base64: btoa('a,b') },
    })
    const { onOpenChange } = renderDialog()
    fireEvent.click(screen.getByRole('radio', { name: /CSV/ }))
    fireEvent.change(screen.getByLabelText('Report title'), { target: { value: ' Debtors ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(actions.exportBillingReport).toHaveBeenCalledWith({
      ...filters,
      columns: ['invoice', 'customer', 'balance'],
      title: 'Debtors',
      format: 'csv',
    })
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('stays open and says so when the report cannot be made', async () => {
    actions.exportBillingReport.mockResolvedValue({ success: false, error: 'nope' })
    const { onOpenChange } = renderDialog()
    fireEvent.click(screen.getByRole('radio', { name: /Excel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(actions.toastError).toHaveBeenCalledWith('The report could not be made. Try again.')
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('warns when more invoices match than one report holds', () => {
    renderDialog(6200)
    expect(screen.getByText(/Only the first 5000 invoices fit in one report/)).toBeTruthy()
  })
})

describe('the printed report', () => {
  const model: ReportModel = {
    title: 'Debtors',
    workshopName: 'ZZ Test Garage',
    workshopLines: ['12 Example Road'],
    generated: 'Generated 20/11/2026 12:00',
    chips: [{ label: 'Status', value: 'Unpaid' }],
    summary: [{ label: 'Outstanding', value: '£70.00', emphasis: true }],
    headers: [
      { column: 'invoice', label: 'Invoice #', numeric: false },
      { column: 'customer', label: 'Customer', numeric: false },
      { column: 'balance', label: 'Balance', numeric: true },
    ],
    sections: [
      {
        label: 'Nordvik',
        heading: 'Nordvik · 1 invoice',
        subtotal: [
          { text: '', raw: null },
          { text: '', raw: null },
          { text: '£70.00', raw: 70 },
        ],
        rows: [
          [
            { text: '2026-1', raw: '2026-1' },
            { text: 'Nordvik', raw: 'Nordvik' },
            { text: '£70.00', raw: 70 },
          ],
        ],
      },
    ],
    total: [
      { text: '', raw: null },
      { text: '', raw: null },
      { text: '£70.00', raw: 70 },
    ],
    totalLabel: 'Total, 1 invoice',
    footer: 'ZZ Test Garage · Debtors',
    fileName: 'debtors',
  }

  it('shows the letterhead, a heading and subtotal per group, and the total', () => {
    const { container } = render(<BillingReportSheet model={model} />)
    expect(screen.getByRole('heading', { name: 'Debtors' })).toBeTruthy()
    const table = within(container.querySelector('table') as HTMLElement)
    expect(table.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Invoice #',
      'Customer',
      'Balance',
    ])
    expect(table.getByRole('rowheader', { name: 'Nordvik · 1 invoice' })).toBeTruthy()
    const total = table.getByRole('rowheader', { name: 'Total, 1 invoice' })
    expect(total.getAttribute('colspan')).toBe('2')
    expect(total.closest('tr')?.textContent).toBe('Total, 1 invoice£70.00')
  })
})
