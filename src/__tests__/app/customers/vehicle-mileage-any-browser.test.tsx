/**
 * A vehicle's mileage on the customer's page reads the same in every browser.
 * It was written with the browser's own number format, so a workshop in
 * Belgium got "96.400" where the server had sent "96,400", and React threw
 * the page away to draw it again (a hydration mismatch).
 */
import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/customers/Actions/customerActions', () => ({
  updateServiceRequest: vi.fn(),
  createWorkOrderFromRequest: vi.fn(),
}))
vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))
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

import { CustomerDetailClient } from '@/app/(authenticated)/customers/[id]/customer-detail-client'

/**
 * A browser set to Dutch as written in Belgium, in a zone far from the
 * server's UTC. Whatever is formatted with no locale comes out its way.
 */
const realNumber = Number.prototype.toLocaleString
const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Pacific/Kiritimati'
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
    this: number,
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions
  ) {
    return realNumber.call(this, locales ?? 'nl-BE', options)
  })
})
afterAll(() => {
  process.env.TZ = originalTz
  vi.restoreAllMocks()
})

const page = (
  <CustomerDetailClient
    customer={{
      id: 'c1',
      customerNumber: null,
      name: 'Sarah Coleman',
      email: null,
      phone: null,
      address: null,
      company: null,
      taxId: null,
      taxExempt: false,
      notes: null,
      vehicles: [
        {
          id: 'v1',
          make: 'Ford',
          model: 'F-150',
          year: 2019,
          mileage: 96400,
          licensePlate: 'TN-2291',
          _count: { serviceRecords: 3 },
        },
      ],
    }}
  />
)

describe("a vehicle's mileage on the customer's page", () => {
  it('is in the language of the app, not the way the browser writes numbers', () => {
    render(page)
    // The card for a phone and the table row for a desk.
    expect(screen.getAllByText(/96,400\s+mi/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/96\.400/)).not.toBeInTheDocument()
  })

  it('is the text the server sent, so the page is not drawn twice', () => {
    const mileage = (html: string) => html.match(/96\D?400/g)
    const browser = mileage(renderToString(page))
    vi.mocked(Number.prototype.toLocaleString).mockImplementation(function (
      this: number,
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions
    ) {
      // The server in Docker: English, UTC.
      return realNumber.call(this, locales ?? 'en-US', options)
    })
    const server = mileage(renderToString(page))
    expect(browser).toEqual(server)
    expect(server).toEqual(['96,400', '96,400'])
  })
})
