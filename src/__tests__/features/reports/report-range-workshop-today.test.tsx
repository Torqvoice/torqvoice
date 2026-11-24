/**
 * The Reports page opens on "this year up to today", and today is the
 * workshop's day. It used to end on the viewer's browser day: somebody in
 * London looking at an Auckland workshop had a range ending on the 24th and
 * lost everything the workshop had dated the 25th.
 */
import { act, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DateSettingsProvider } from '@/components/date-settings-context'

const { getRevenueReport } = vi.hoisted(() => ({
  getRevenueReport: vi.fn(async (_params: unknown) => ({ success: false })),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reports',
}))
vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))
vi.mock('@/features/reports/Actions/reportActions', () => {
  const none = async () => ({ success: false })
  return {
    getRevenueReport: (params: unknown) => getRevenueReport(params),
    getServiceReport: none,
    getCustomerReport: none,
    getInventoryReport: none,
    getTechnicianReport: none,
    getPartsUsageReport: none,
    getJobAnalyticsReport: none,
    getCustomerRetentionReport: none,
    getTaxReport: none,
    getPastDueInvoicesReport: none,
    getVehicleReport: none,
    getTechnicianTimeReport: none,
  }
})
vi.mock('@react-pdf/renderer', () => ({ pdf: vi.fn() }))
vi.mock('@/features/reports/Components/ReportPDF', () => ({ ReportPDF: () => null }))

import ReportsClient from '@/app/(authenticated)/reports/reports-client'

// The viewer's browser is in London.
const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Europe/London'
})
afterAll(() => {
  process.env.TZ = originalTz
})
beforeEach(() => {
  getRevenueReport.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

async function openReports(zone: string, now: string, dateFormat = 'dd/MM/yyyy') {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(now))
  await act(async () => {
    render(
      <DateSettingsProvider dateFormat={dateFormat} timeFormat="24h" timezone={zone}>
        <ReportsClient currencyCode="NZD" primaryColor="#d97706" organizationName="Test" />
      </DateSettingsProvider>
    )
  })
}

describe('the default report range', () => {
  it("ends on the Auckland workshop's today for a viewer in London", async () => {
    // 16:00 on 24 November in London, 05:00 on the 25th in Auckland.
    await openReports('Pacific/Auckland', '2026-11-24T16:00:00Z')
    expect(screen.getByText('01/01/2026 – 25/11/2026')).toBeInTheDocument()
    expect(getRevenueReport).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2026-01-01', endDate: '2026-11-25' })
    )
  })

  it("ends on the Los Angeles workshop's today, a day behind London", async () => {
    // 06:00 on 25 November in London, 22:00 on the 24th in Los Angeles.
    await openReports('America/Los_Angeles', '2026-11-25T06:00:00Z')
    expect(screen.getByText('01/01/2026 – 24/11/2026')).toBeInTheDocument()
    expect(getRevenueReport).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2026-01-01', endDate: '2026-11-24' })
    )
  })

  it("writes the range in the workshop's date format, whichever it chose", async () => {
    await openReports('Pacific/Auckland', '2026-11-24T16:00:00Z', 'MM/dd/yyyy')
    expect(screen.getByText('01/01/2026 – 11/25/2026')).toBeInTheDocument()
  })

  it("starts on the workshop's new year while London is still in the old one", async () => {
    // 12:00 UTC on 31 December is already 1 January 2027 in Auckland.
    await openReports('Pacific/Auckland', '2026-12-31T12:00:00Z')
    expect(getRevenueReport).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2027-01-01', endDate: '2027-01-01' })
    )
  })
})
