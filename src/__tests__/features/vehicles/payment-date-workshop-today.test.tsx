/**
 * The payment form starts on the workshop's today. It used to start on the UTC
 * day: at 05:00 on 25 November in Auckland the form said 24 November, the
 * payment was stored on the 24th, and near a month end Collected in reports
 * counted the money in the wrong month.
 *
 * The date field's placeholder is the same day, worked out the same way on
 * the server and in the browser, so the page no longer hydrates with a
 * different placeholder than the server drew.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DateSettingsProvider } from '@/components/date-settings-context'
import { DateInput } from '@/components/ui/date-input'
import { PaymentsSection } from '@/features/vehicles/Components/service-detail/PaymentsSection'

vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))

// The browser doing the rendering is in London, the workshop elsewhere.
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

function at(instant: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(instant))
}

function Section({
  zone,
  onCreatePayment,
}: {
  zone: string
  onCreatePayment: (data: { date: string }) => Promise<boolean>
}) {
  return (
    <DateSettingsProvider dateFormat="dd/MM/yyyy" timeFormat="24h" timezone={zone}>
      <PaymentsSection
        payments={[]}
        paymentStatus="unpaid"
        manuallyPaid={false}
        totalPaid={0}
        displayTotal={250}
        balanceDue={250}
        currencyCode="NZD"
        onCreatePayment={onCreatePayment}
        onDeletePayment={vi.fn()}
        onTogglePaid={vi.fn()}
        paymentLoading={false}
        deletingPayment={null}
      />
    </DateSettingsProvider>
  )
}

async function openAndSave(zone: string) {
  const onCreatePayment = vi.fn(async () => true)
  render(<Section zone={zone} onCreatePayment={onCreatePayment} />)
  fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }))
  const shown = (screen.getByLabelText('Date') as HTMLInputElement).value
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save Payment' }))
  })
  return { shown, saved: onCreatePayment.mock.calls[0]?.[0] }
}

describe('the payment form', () => {
  it("starts on the workshop's day in Auckland, a day ahead of UTC", async () => {
    at('2026-11-24T16:00:00Z')
    const { shown, saved } = await openAndSave('Pacific/Auckland')
    expect(shown).toBe('25/11/2026')
    expect(saved).toMatchObject({ amount: 250, date: '2026-11-25' })
  })

  it("starts on the workshop's day in Los Angeles, a day behind UTC", async () => {
    at('2026-11-25T06:00:00Z')
    const { shown, saved } = await openAndSave('America/Los_Angeles')
    expect(shown).toBe('24/11/2026')
    expect(saved).toMatchObject({ date: '2026-11-24' })
  })
})

describe('an empty date field', () => {
  it("shows the workshop's today as its placeholder", () => {
    at('2026-11-24T16:00:00Z')
    render(
      <DateSettingsProvider dateFormat="dd/MM/yyyy" timeFormat="24h" timezone="Pacific/Auckland">
        <DateInput id="d" value="" onChange={vi.fn()} />
      </DateSettingsProvider>
    )
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '25/11/2026')
  })
})
