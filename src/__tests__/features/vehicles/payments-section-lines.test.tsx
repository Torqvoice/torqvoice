/**
 * The payments on the work order, as the workshop reads them: what came in is
 * the amount that came in, not a minus figure, and the method is a word, not
 * the code it is stored as. A refund (a negative payment, from a ledger sync)
 * says it is a refund.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkOrderLayoutProvider } from '@/components/work-order-layout-context'
import { PaymentsSection } from '@/features/vehicles/Components/service-detail/PaymentsSection'

const noop = vi.fn()

const payments = [
  {
    id: 'p1',
    amount: 200,
    date: new Date('2026-11-24T10:00:00Z'),
    method: 'card',
    note: null,
    createdAt: new Date(),
  },
  {
    id: 'p2',
    amount: 100,
    date: new Date('2026-11-24T11:00:00Z'),
    method: 'cash',
    note: null,
    createdAt: new Date(),
  },
  {
    id: 'p3',
    amount: -50,
    date: new Date('2026-11-25T11:00:00Z'),
    method: 'transfer',
    note: null,
    createdAt: new Date(),
  },
  {
    id: 'p4',
    amount: 80,
    date: new Date('2026-11-25T12:00:00Z'),
    method: 'paypal',
    note: null,
    createdAt: new Date(),
  },
]

function Section({ modern }: { modern: boolean }) {
  return (
    <WorkOrderLayoutProvider value={modern}>
      <PaymentsSection
        payments={payments}
        paymentStatus="partial"
        manuallyPaid={false}
        totalPaid={330}
        displayTotal={500}
        balanceDue={170}
        currencyCode="USD"
        onCreatePayment={async () => true}
        onDeletePayment={noop}
        onTogglePaid={noop}
        paymentLoading={false}
        deletingPayment={null}
      />
    </WorkOrderLayoutProvider>
  )
}

describe('payments on the work order', () => {
  it('lists money received as positive amounts with the method in words', () => {
    render(<Section modern />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Card')
    expect(rows[0]).toHaveTextContent('$200.00')
    expect(rows[0]).not.toHaveTextContent('-$200.00')
    expect(rows[1]).toHaveTextContent('Cash')
    expect(rows[1]).toHaveTextContent('$100.00')
    expect(rows[1]).not.toHaveTextContent('-$100.00')
    expect(rows[3]).toHaveTextContent('PayPal')
    expect(screen.getByTestId('balance-due')).toHaveTextContent('$170.00')
  })

  it('says a refund is a refund', () => {
    render(<Section modern />)
    const refund = screen.getAllByRole('listitem')[2]
    expect(refund).toHaveTextContent('Refund')
    expect(refund).toHaveTextContent('Transfer')
    expect(refund).toHaveTextContent('-$50.00')
  })

  it('translates the method in the classic table too', () => {
    render(<Section modern={false} />)
    expect(screen.getByText('Card')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('Refund')).toBeInTheDocument()
    expect(screen.queryByText('card')).toBeNull()
  })
})
