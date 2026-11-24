/**
 * The payment form opens with the balance due already in Amount, and refuses
 * an amount above it next to the field, saying how much is due, before
 * anything is sent. The server refuses it too (create-payment-balance.test).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkOrderLayoutProvider } from '@/components/work-order-layout-context'
import { PaymentsSection } from '@/features/vehicles/Components/service-detail/PaymentsSection'

const noop = vi.fn()
const onCreatePayment = vi.fn(async () => true)

function Section({
  modern,
  payments = [],
}: {
  modern: boolean
  payments?: { id: string; amount: number; date: string; method: string; note: string | null }[]
}) {
  const paid = payments.reduce((sum, p) => sum + p.amount, 0)
  return (
    <WorkOrderLayoutProvider value={modern}>
      <PaymentsSection
        payments={payments as never}
        paymentStatus={paid ? 'partial' : 'unpaid'}
        manuallyPaid={false}
        totalPaid={paid}
        displayTotal={552.74}
        balanceDue={552.74 - paid}
        currencyCode="GBP"
        onCreatePayment={onCreatePayment}
        onDeletePayment={noop}
        onTogglePaid={noop}
        paymentLoading={false}
        deletingPayment={null}
      />
    </WorkOrderLayoutProvider>
  )
}

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: /record payment/i }))
  return screen.getByLabelText('Amount') as HTMLInputElement
}

beforeEach(() => {
  onCreatePayment.mockClear()
})

describe.each([
  ['the overhauled work order', true],
  ['the classic work order', false],
])('the payment form on %s', (_, modern) => {
  it('opens with the balance due in Amount', () => {
    render(<Section modern={modern} />)
    expect(openForm().value).toBe('552.74')
  })

  it('opens with what is left once part has been paid', () => {
    render(
      <Section
        modern={modern}
        payments={[{ id: 'p1', amount: 500, date: '2026-11-20', method: 'cash', note: null }]}
      />
    )
    expect(openForm().value).toBe('52.74')
  })

  it('refuses more than the balance due and says how much is due, beside Amount', () => {
    render(<Section modern={modern} />)
    const amount = openForm()
    fireEvent.change(amount, { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /save payment/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The balance due is £552.74. A payment cannot be more than that.'
    )
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(amount).toHaveAccessibleDescription(
      'The balance due is £552.74. A payment cannot be more than that.'
    )
    expect(onCreatePayment).not.toHaveBeenCalled()
  })

  it('takes exactly the balance due', () => {
    render(<Section modern={modern} />)
    openForm()
    fireEvent.click(screen.getByRole('button', { name: /save payment/i }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(onCreatePayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 552.74 }))
  })

  it('clears the message once the amount is changed', () => {
    render(<Section modern={modern} />)
    const amount = openForm()
    fireEvent.change(amount, { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /save payment/i }))
    fireEvent.change(amount, { target: { value: '500' } })

    expect(screen.queryByRole('alert')).toBeNull()
  })
})
