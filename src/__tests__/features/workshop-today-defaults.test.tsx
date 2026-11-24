/**
 * Date fields that start on "today" start on the workshop's today, and the
 * scheduled-message dialog shows and checks its time on the workshop's clock,
 * which is the clock the server reads it back on. The browser here is in
 * London; the workshop is in Auckland, at 05:00 on 25 November while London
 * and UTC are still at 16:00 on the 24th.
 */
import { render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DateSettingsProvider } from '@/components/date-settings-context'

vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))
vi.mock('@/features/scheduled-messages/Actions/scheduledMessageActions', () => ({
  createScheduledMessage: vi.fn(),
  updateScheduledMessage: vi.fn(),
}))
vi.mock('@/features/whatsapp/Actions/whatsappActions', () => ({
  getWhatsappTemplateState: vi.fn(async () => ({ success: true, data: { ready: true } })),
}))
vi.mock('@/features/quotes/Components/CustomerCombobox', () => ({ CustomerCombobox: () => null }))
vi.mock('@/features/status-reports/Actions/createStatusReport', () => ({
  createStatusReport: vi.fn(),
}))
vi.mock('@/components/video-recorder-dialog', () => ({ VideoRecorderDialog: () => null }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/hooks/use-native-camera', () => ({ useNativeCamera: () => false }))

import { ScheduleMessageDialog } from '@/features/scheduled-messages/Components/ScheduleMessageDialog'
import { CreateStatusReportDialog } from '@/features/status-reports/Components/CreateStatusReportDialog'

const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Europe/London'
})
afterAll(() => {
  process.env.TZ = originalTz
})
afterEach(() => {
  vi.useRealTimers()
})

function inAuckland(children: React.ReactNode) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-24T16:00:00Z'))
  return render(
    <DateSettingsProvider dateFormat="yyyy-MM-dd" timeFormat="24h" timezone="Pacific/Auckland">
      {children}
    </DateSettingsProvider>
  )
}

describe('scheduling a message', () => {
  it("starts a new message on the workshop's today", () => {
    inAuckland(<ScheduleMessageDialog open onOpenChange={vi.fn()} availableChannels={['email']} />)
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-25')
  })

  it('shows a saved message at the time the workshop set, not London time', () => {
    inAuckland(
      <ScheduleMessageDialog
        open
        onOpenChange={vi.fn()}
        availableChannels={['email']}
        message={{
          id: 'm1',
          channel: 'email',
          subject: 'Your car is ready',
          body: 'Hello',
          recipient: 'someone@example.com',
          // 09:00 on 26 November in Auckland.
          sendAt: new Date('2026-11-25T20:00:00Z'),
          frequency: 'once',
          endDate: null,
          customer: null,
        }}
      />
    )
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-26')
    expect(screen.getByLabelText('Time')).toHaveValue('09:00')
    expect(screen.queryByText(/already passed/)).toBeNull()
  })

  it("calls 04:00 on the workshop's today past, which London would call tomorrow", () => {
    inAuckland(
      <ScheduleMessageDialog
        open
        onOpenChange={vi.fn()}
        availableChannels={['email']}
        defaultDate="2026-11-25"
        defaultTime="04:00"
      />
    )
    expect(screen.getByText(/already passed/)).toBeInTheDocument()
  })
})

describe('a status report link', () => {
  it("expires two weeks from the workshop's today", () => {
    inAuckland(
      <CreateStatusReportDialog
        open
        onOpenChange={vi.fn()}
        serviceRecordId="job1"
        vehicleName="2019 Volvo V70"
        customer={null}
        smsEnabled={false}
        emailEnabled={false}
        telegramEnabled={false}
      />
    )
    expect(screen.getByLabelText('Link expires')).toHaveValue('2026-12-09')
  })
})
