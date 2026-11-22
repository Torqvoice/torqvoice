/**
 * The day on a status report's share page is the workshop's day, written by
 * the server. The browser used to write it, in the phone's zone and the
 * phone's date style, so a customer far from the server read another day
 * than the server had rendered and React drew the page twice.
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
    expect(formatReportDay(MADE, 'en', 'Australia/Sydney')).toBe('December 1, 2026')
    expect(formatReportDay(MADE, 'en', 'Pacific/Honolulu')).toBe('November 30, 2026')
  })

  it("is written in the page's language", () => {
    expect(formatReportDay(MADE, 'nl', 'Europe/Brussels')).toBe('30 november 2026')
    expect(formatReportDay(MADE, 'fr', 'Europe/Brussels')).toBe('30 novembre 2026')
  })

  it('falls back to the day in UTC for a zone the runtime does not know', () => {
    expect(formatReportDay(MADE, 'en', 'Mars/Olympus')).toBe('November 30, 2026')
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
          createdDay: formatReportDay(MADE, 'en', 'Australia/Sydney'),
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
    expect(screen.getByText('December 1, 2026')).toBeInTheDocument()
  })
})
