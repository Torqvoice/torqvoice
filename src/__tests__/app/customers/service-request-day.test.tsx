/**
 * The day a customer asked to come in, on the customer's page in the app. It
 * is stored as midnight on the workshop's clock, so it is that day wherever
 * the person reading it sits: a bookkeeper a few zones west of the workshop
 * must not read the day before.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DateSettingsProvider } from '@/components/date-settings-context'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/customers/Actions/customerActions', () => ({
  updateServiceRequest: vi.fn(),
  createWorkOrderFromRequest: vi.fn(),
}))
vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))
// Parts of the page that are not the request card.
vi.mock('@/features/ai/Components/AskAiSheet', () => ({ AskAiSheet: () => null }))
vi.mock('@/features/sms/Components/SmsConversation', () => ({ SmsConversation: () => null }))
vi.mock('@/features/whatsapp/Components/WhatsappConversation', () => ({
  WhatsappConversation: () => null,
}))
vi.mock('@/features/telegram/Components/TelegramConversation', () => ({
  TelegramConversation: () => null,
}))
vi.mock('@/features/customers/Components/CustomerForm', () => ({ CustomerForm: () => null }))
vi.mock('@/features/vehicles/Components/VehicleForm', () => ({ VehicleForm: () => null }))
vi.mock('@/features/sms/Components/SendSmsDialog', () => ({ SendSmsDialog: () => null }))
vi.mock('@/features/telegram/Components/TelegramQrCode', () => ({ TelegramQrCode: () => null }))
vi.mock('@/features/portal/Components/ServiceRequestFiles', () => ({
  ServiceRequestFiles: () => null,
}))

import { ServiceRequestCard } from '@/app/(authenticated)/customers/[id]/customer-detail-client'

/**
 * A workshop on Kiritimati, fourteen hours ahead of UTC: its midnight is ten
 * in the morning of the day before in UTC, and the day before in every zone
 * a browser or this test could be running in.
 */
const WORKSHOP_ZONE = 'Pacific/Kiritimati'
// Midnight on 10 December 2026 in the workshop.
const WISHED_DAY = new Date('2026-12-09T10:00:00Z')

function card(preferredTime: string | null = null) {
  render(
    <DateSettingsProvider dateFormat="yyyy-MM-dd" timeFormat="24h" timezone={WORKSHOP_ZONE}>
      <ServiceRequestCard
        request={{
          id: 'req-1',
          description: 'A knocking noise from the front',
          preferredDate: WISHED_DAY,
          preferredTime,
          attachments: [],
          status: 'pending',
          adminNotes: null,
          // 23:30 on 1 December in UTC, already 2 December in the workshop.
          createdAt: new Date('2026-12-01T23:30:00Z'),
          vehicle: { id: 'v1', make: 'Volvo', model: 'V60', year: 2019 },
        }}
        smsEnabled={false}
        customerPhone={null}
        customerName="Kari Nordmann"
        customerId="c1"
      />
    </DateSettingsProvider>
  )
}

describe("a service request on the customer's page", () => {
  it("shows the wished day as the workshop's day, not the day before", () => {
    card()
    expect(screen.getByText('Preferred: 2026-12-10')).toBeInTheDocument()
  })

  it('keeps the part of the day beside it', () => {
    card('morning')
    expect(screen.getByText('Preferred: 2026-12-10, morning')).toBeInTheDocument()
  })

  it("dates the request on the workshop's calendar too", () => {
    card()
    expect(screen.getByText('Submitted 2026-12-02')).toBeInTheDocument()
  })
})
