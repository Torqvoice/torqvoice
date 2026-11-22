/**
 * "Take payment" on the work order's money bar opens the payment form and
 * puts the cursor in Amount, so the figure can be typed at once.
 *
 * The form used to be asked for and the cursor placed in the same breath, on
 * the next animation frame. React draws the form a moment after it is asked
 * for, and nothing promises that moment comes before the frame: when the
 * frame came first there was no Amount field to focus, and the cursor stayed
 * on the button. The frame is run early here, which is that case.
 */

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkOrderLayoutProvider } from '@/components/work-order-layout-context'
import { PaymentsSection } from '@/features/vehicles/Components/service-detail/PaymentsSection'

const noop = vi.fn()

function Section({ signal }: { signal: number }) {
  return (
    <WorkOrderLayoutProvider value={true}>
      <PaymentsSection
        payments={[]}
        paymentStatus="unpaid"
        manuallyPaid={false}
        totalPaid={0}
        displayTotal={250}
        balanceDue={250}
        currencyCode="USD"
        onCreatePayment={async () => true}
        onDeletePayment={noop}
        onTogglePaid={noop}
        paymentLoading={false}
        deletingPayment={null}
        openFormSignal={signal}
      />
    </WorkOrderLayoutProvider>
  )
}

describe('the payment form opened from the money bar', () => {
  beforeEach(() => {
    // The frame arrives before React has drawn anything it was just asked for.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stays closed until it is asked for', () => {
    render(<Section signal={0} />)
    expect(document.getElementById('paymentAmount')).toBeNull()
  })

  it('opens with the cursor in Amount', () => {
    const { rerender } = render(<Section signal={0} />)
    rerender(<Section signal={1} />)
    expect(screen.getByLabelText('Amount')).toHaveFocus()
  })

  it('takes the cursor back to Amount when asked again with the form open', () => {
    const { rerender } = render(<Section signal={0} />)
    rerender(<Section signal={1} />)
    screen.getByLabelText('Note').focus()
    rerender(<Section signal={2} />)
    expect(screen.getByLabelText('Amount')).toHaveFocus()
  })
})
