/**
 * Two things the Reports page says about itself.
 *
 * - "Completed only" shows whether it is on. It carried a check mark either
 *   way, so an outlined button with a tick read as switched on when it was off.
 * - The tax report counts VAT on the document date, paid or not, and jobs
 *   not invoiced yet on their start or service date. So its total is neither
 *   tax collected nor tax invoiced: the labels say "Tax" and no more.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DateSettingsProvider } from '@/components/date-settings-context'

const { searchParams } = vi.hoisted(() => ({ searchParams: { value: '' } }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchParams.value),
  usePathname: () => '/reports',
}))
vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))
vi.mock('@/features/reports/Actions/reportActions', () => {
  const none = async () => ({ success: false })
  return {
    getRevenueReport: none,
    getServiceReport: none,
    getCustomerReport: none,
    getInventoryReport: none,
    getTechnicianReport: none,
    getPartsUsageReport: none,
    getJobAnalyticsReport: none,
    getCustomerRetentionReport: none,
    getTaxReport: async () => ({
      success: true,
      data: {
        monthly: [{ month: '2026-11', taxCollected: 120, invoiceCount: 2, taxableAmount: 600 }],
        byRate: [{ taxRate: 20, taxCollected: 120, invoiceCount: 2 }],
        summary: { totalTaxCollected: 120, totalTaxableAmount: 600, totalInvoices: 2 },
      },
    }),
    getPastDueInvoicesReport: none,
    getVehicleReport: none,
    getTechnicianTimeReport: none,
  }
})
vi.mock('@react-pdf/renderer', () => ({ pdf: vi.fn() }))
vi.mock('@/features/reports/Components/ReportPDF', () => ({ ReportPDF: () => null }))
// The chart measures its box, which jsdom cannot.
vi.mock('@/features/reports/Components/TaxCharts', () => ({ TaxBarChart: () => null }))

import ReportsClient from '@/app/(authenticated)/reports/reports-client'

async function openReports(tab = '') {
  searchParams.value = tab
  await act(async () => {
    render(
      <DateSettingsProvider dateFormat="dd/MM/yyyy" timeFormat="24h" timezone="Pacific/Auckland">
        <ReportsClient currencyCode="GBP" primaryColor="#d97706" organizationName="Test" />
      </DateSettingsProvider>
    )
  })
}

describe('the "Completed only" button', () => {
  it('shows a tick only while it is on', async () => {
    await openReports()
    const toggle = screen.getByRole('button', { name: 'Completed only' })

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle.querySelector('.lucide-circle-check')).toBeNull()
    expect(toggle.querySelector('.lucide-circle')).not.toBeNull()

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle.querySelector('.lucide-circle-check')).not.toBeNull()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle.querySelector('.lucide-circle-check')).toBeNull()
  })
})

describe('the tax report', () => {
  it('calls its figures tax, claiming neither collected nor invoiced', async () => {
    await openReports('tab=financial&subtab=tax')

    expect(await screen.findByText('Total Tax')).toBeInTheDocument()
    expect(screen.getByText('Monthly Tax')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader', { name: 'Tax' }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Tax (Collected|Invoiced)/i)).toBeNull()
  })
})
