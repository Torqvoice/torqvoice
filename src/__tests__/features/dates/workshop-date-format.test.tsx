/**
 * Dates read the way the workshop writes them (Settings, Localization), on
 * the workshop's clock: a meter's last reading, a status report's day, the
 * booked time in the schedule picker. They used to come out in the
 * language's own form ("Nov 24, 2026", "November 25th, 2026 07:00") beside
 * a "24/11/2026" on the same page.
 *
 * The browser here is far west of UTC and the workshop far east of it, so a
 * date read on the wrong clock lands on the wrong day.
 */
import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/settings/Actions/timezoneActions', () => ({
  adoptDetectedTimezone: vi.fn(async () => undefined),
}))
vi.mock('@/features/meters/Actions/vehicleMeterActions', () => ({
  addMeterReading: vi.fn(),
  addVehicleMeter: vi.fn(),
  markMeterReadingWrong: vi.fn(),
  removeVehicleMeter: vi.fn(),
  replaceVehicleMeter: vi.fn(),
}))
vi.mock('@/features/equipment/Actions/equipmentItemActions', () => ({
  addEquipmentMeter: vi.fn(),
}))
vi.mock('@/features/status-reports/Actions/deleteStatusReport', () => ({
  deleteStatusReport: vi.fn(),
}))
vi.mock('@/features/status-reports/Components/CreateStatusReportDialog', () => ({
  CreateStatusReportDialog: () => null,
}))
vi.mock('@/features/status-reports/Components/SendStatusReportDialog', () => ({
  SendStatusReportDialog: () => null,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { ConfirmProvider } from '@/components/confirm-dialog'
import { DateSettingsProvider } from '@/components/date-settings-context'
import { DateTimePicker } from '@/components/ui/datetime-picker'
import { VehicleMeters } from '@/features/meters/Components/VehicleMeters'
import { StatusReportList } from '@/features/status-reports/Components/StatusReportList'
import { templateValues } from '@/features/inspection-reminders/Lib/campaign'
import { buildPortalFormat } from '@/features/portal/Lib/portalFormat'
import { formatReportDay } from '@/features/status-reports/Lib/reportDay'
import { formatDate, formatDateTime, formatDayKey, formatTime } from '@/lib/format'

const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  process.env.TZ = originalTz
})

// 08:30 on 25 November in Auckland; still 24 November in UTC and in Los Angeles.
const MORNING_IN_AUCKLAND = '2026-11-24T19:30:00.000Z'

function inWorkshop(dateFormat: string, children: React.ReactNode) {
  return render(
    <DateSettingsProvider dateFormat={dateFormat} timeFormat="24h" timezone="Pacific/Auckland">
      <ConfirmProvider>{children}</ConfirmProvider>
    </DateSettingsProvider>
  )
}

const meters = () => (
  <VehicleMeters
    vehicleId="veh-1"
    types={[{ id: 'mt-1', name: 'Engine hours', unit: 'hrs' }]}
    meters={[
      {
        id: 'm-1',
        meterTypeId: 'mt-1',
        name: 'Engine hours',
        unit: 'hrs',
        current: 1250,
        currentAt: MORNING_IN_AUCKLAND,
        total: 1250,
        replaced: false,
        readings: [],
      },
    ]}
  />
)

describe("a meter's last reading", () => {
  it("is dated on the workshop's day in its date format", () => {
    inWorkshop('dd/MM/yyyy', meters())
    expect(screen.getByText(/Read 25\/11\/2026/)).toBeInTheDocument()
    expect(screen.queryByText(/Nov/)).not.toBeInTheDocument()
  })

  it('follows another format the workshop chose', () => {
    inWorkshop('MM/dd/yyyy', meters())
    expect(screen.getByText(/Read 11\/25\/2026/)).toBeInTheDocument()
  })
})

const reports = () => (
  <StatusReportList
    serviceRecordId="sr-1"
    organizationId="org-1"
    vehicleName="Volvo V60"
    customer={null}
    smsEnabled={false}
    emailEnabled={false}
    telegramEnabled={false}
    initialReports={[
      {
        id: 'r-1',
        title: 'Brake pads',
        message: null,
        status: 'sent',
        videoUrl: null,
        createdAt: MORNING_IN_AUCKLAND,
        expiresAt: null,
        publicToken: 'tok',
        customerFeedback: null,
        feedbackAt: null,
        sentVia: 'sms',
        sentAt: MORNING_IN_AUCKLAND,
      },
    ]}
  />
)

describe("a work order's status reports", () => {
  it("are listed with the workshop's day and clock", () => {
    inWorkshop('dd/MM/yyyy', reports())
    expect(screen.getAllByText('25/11/2026 08:30').length).toBeGreaterThan(0)
  })

  it('follow another format the workshop chose', () => {
    inWorkshop('yyyy-MM-dd', reports())
    expect(screen.getAllByText('2026-11-25 08:30').length).toBeGreaterThan(0)
  })
})

describe('the date and time picker', () => {
  const picker = () => (
    <DateTimePicker
      value={new Date(MORNING_IN_AUCKLAND)}
      timeZone="Pacific/Auckland"
      granularity="minute"
      hourCycle={24}
    />
  )

  it("shows the booked time in the workshop's date format on its clock", () => {
    inWorkshop('dd/MM/yyyy', picker())
    expect(screen.getByRole('button', { name: '25/11/2026 08:30' })).toBeInTheDocument()
  })

  it('follows another format the workshop chose', () => {
    inWorkshop('MM/dd/yyyy', picker())
    expect(screen.getByRole('button', { name: '11/25/2026 08:30' })).toBeInTheDocument()
  })
})

describe('the due date in an inspection reminder the customer receives', () => {
  const values = (dateFormat: string) =>
    templateValues({
      candidate: {
        vehicleId: 'v-1',
        customerId: 'c-1',
        customerName: 'Kari',
        vehicle: 'Volvo V60',
        licensePlate: 'EV11223',
        // Midnight on 1 December in Auckland, still 30 November in UTC.
        dueAt: '2026-11-30T11:00:00.000Z',
        recipient: '+64 21 000 000',
        overdue: false,
        excluded: null,
        lastRemindedAt: null,
      },
      settings: {
        durationMinutes: 60,
        leadDays: 1,
        horizonWeeks: 4,
        walkInReserve: 0,
        linkValidDays: 7,
        bookingMode: 'direct',
        phone: null,
        workshopName: 'Harbour Motors',
        templateSms: null,
        templateEmailSubject: null,
        templateEmailBody: null,
        workingHours: {
          start: '08:00',
          end: '16:00',
          includeWeekends: false,
          timeZone: 'Pacific/Auckland',
        },
        timeZone: 'Pacific/Auckland',
        timeZoneDetected: false,
        dateFormat,
      },
      link: 'https://example.test/b/tok',
      locale: 'en',
    }).dueDate

  it("is the workshop's day in its date format", () => {
    expect(values('dd/MM/yyyy')).toBe('01/12/2026')
    expect(values('MM/dd/yyyy')).toBe('12/01/2026')
  })
})

describe('a workshop format that spells the month', () => {
  // 22:30 UTC on 30 November: already 1 December in Auckland.
  const MADE = new Date('2026-11-30T22:30:00Z')

  it("names the month in the customer's language, not in English", () => {
    expect(formatDate(MADE, 'd MMMM yyyy', 'Europe/Oslo', 'nb')).toBe('30 november 2026')
    expect(formatDate(MADE, 'd MMMM yyyy', 'Pacific/Auckland', 'nb')).toBe('1 desember 2026')
    expect(formatDate(MADE, 'd MMMM yyyy', 'Pacific/Auckland', 'de')).toBe('1 Dezember 2026')
    expect(formatDayKey('2026-05-17', 'd MMMM yyyy', 'nb')).toBe('17 mai 2026')
  })

  it('keeps the English names the app has always used when no language is given', () => {
    expect(formatDate(MADE, 'MMM d, yyyy', 'Pacific/Auckland')).toBe('Dec 1, 2026')
    expect(formatDate(MADE, 'd MMMM yyyy', 'Pacific/Auckland')).toBe('1 December 2026')
  })

  it('reaches the status report share page and the portal in that language', () => {
    expect(formatReportDay(MADE, 'd MMMM yyyy', 'Pacific/Auckland', 'nb')).toBe('1 desember 2026')
    const portal = buildPortalFormat({
      locale: 'nb',
      timeZone: 'Pacific/Auckland',
      timeFormat: '24h',
      dateFormat: 'd MMMM yyyy',
      money: (amount) => `${amount} kr`,
      today: 'i dag',
      tomorrow: 'i morgen',
      now: new Date('2026-11-01T00:00:00Z'),
    })
    expect(portal.day(MADE.toISOString())).toBe('1 desember 2026')
  })
})

describe("a time that falls in the viewer's own DST gap", () => {
  // 02:30 on 8 March in Auckland. Los Angeles, where this browser is, springs
  // forward at 02:00 that same morning, so 02:30 does not exist there.
  const IN_THE_GAP = '2026-03-07T13:30:00.000Z'

  it("is still the workshop's 02:30", () => {
    expect(formatDateTime(IN_THE_GAP, 'dd/MM/yyyy', '24h', 'Pacific/Auckland')).toBe(
      '08/03/2026 02:30'
    )
    expect(formatTime(IN_THE_GAP, '24h', 'Pacific/Auckland')).toBe('02:30')
    expect(formatTime(IN_THE_GAP, '12h', 'Pacific/Auckland')).toBe('02:30 AM')
  })

  it('reads 02:30 in the list of status reports', () => {
    inWorkshop(
      'dd/MM/yyyy',
      <StatusReportList
        serviceRecordId="sr-1"
        organizationId="org-1"
        vehicleName="Volvo V60"
        customer={null}
        smsEnabled={false}
        emailEnabled={false}
        telegramEnabled={false}
        initialReports={[
          {
            id: 'r-2',
            title: 'Night check',
            message: null,
            status: 'sent',
            videoUrl: null,
            createdAt: IN_THE_GAP,
            expiresAt: null,
            publicToken: 'tok2',
            customerFeedback: null,
            feedbackAt: null,
            sentVia: 'sms',
            sentAt: IN_THE_GAP,
          },
        ]}
      />
    )
    expect(screen.getAllByText('08/03/2026 02:30').length).toBeGreaterThan(0)
  })
})

describe('a calendar day key', () => {
  it('is the same day in any format, on any clock', () => {
    expect(formatDayKey('2026-11-25', 'dd/MM/yyyy')).toBe('25/11/2026')
    expect(formatDayKey('2026-11-25', 'MM/dd/yyyy')).toBe('11/25/2026')
    expect(formatDayKey('2026-01-01', 'd. MMM yyyy')).toBe('1. Jan 2026')
  })

  it('leaves anything that is not a day key as it is', () => {
    expect(formatDayKey('soon', 'dd/MM/yyyy')).toBe('soon')
  })
})
