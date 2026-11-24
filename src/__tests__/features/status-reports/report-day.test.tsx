/**
 * The day on a status report's share page is the workshop's day, written by
 * the server in the workshop's date format, the same way the expiry date
 * beside it is. The browser used to write it, in the phone's zone and the
 * phone's date style, and then the server wrote it in the language's long
 * form ("November 24, 2026") next to a "08/12/2026" expiry.
 */
import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/status-reports/Actions/submitFeedback', () => ({
  submitStatusReportFeedback: vi.fn(),
}))

import { StatusReportView } from '@/app/(public)/share/status-report/[orgId]/[token]/status-report-view'
import { formatReportDay } from '@/features/status-reports/Lib/reportDay'

// 22:30 on 30 November in UTC: already 1 December in Sydney, still the
// morning of 30 November in Honolulu.
const MADE = new Date('2026-11-30T22:30:00Z')

// The machine doing the formatting is fourteen hours ahead of UTC.
const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Pacific/Kiritimati'
})
afterAll(() => {
  process.env.TZ = originalTz
})

describe('the day a status report was made', () => {
  it("is the workshop's day, whatever clock the machine has", () => {
    expect(formatReportDay(MADE, 'dd/MM/yyyy', 'Australia/Sydney')).toBe('01/12/2026')
    expect(formatReportDay(MADE, 'dd/MM/yyyy', 'Pacific/Honolulu')).toBe('30/11/2026')
  })

  it("is written in the workshop's date format", () => {
    expect(formatReportDay(MADE, 'MM/dd/yyyy', 'Australia/Sydney')).toBe('12/01/2026')
    expect(formatReportDay(MADE, 'yyyy-MM-dd', 'Australia/Sydney')).toBe('2026-12-01')
    expect(formatReportDay(MADE, 'dd.MM.yyyy', 'Europe/Brussels')).toBe('30.11.2026')
  })

  it('falls back to the day in UTC for a zone the runtime does not know', () => {
    expect(formatReportDay(MADE, 'dd/MM/yyyy', 'Mars/Olympus')).toBe('30/11/2026')
  })

  it('is shown on the share page exactly as the server wrote it', () => {
    render(
      <StatusReportView
        report={{
          id: 'r1',
          title: 'Brake pads',
          message: null,
          videoUrl: null,
          videoFileName: null,
          status: 'sent',
          createdDay: formatReportDay(MADE, 'dd/MM/yyyy', 'Australia/Sydney'),
          customerFeedback: null,
          feedbackAt: null,
        }}
        vehicle={null}
        serviceTitle="Brake service"
        subject="service"
        technicianName={null}
        workshopName="Riverside Auto"
        workshopPhone=""
        primaryColor="#3b82f6"
        token="t"
        showBranding={false}
      />
    )
    expect(screen.getByText('01/12/2026')).toBeInTheDocument()
  })
})
