/**
 * A check the customer asked to have priced says so on the checklist row, so
 * a technician scrolling the sections sees the request without opening the
 * card above.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/inspections/Actions/inspectionActions', () => ({
  updateInspectionItem: vi.fn(),
}))
vi.mock('@/features/inspections/Actions/attachmentActions', () => ({
  addInspectionItemMedia: vi.fn(),
  removeInspectionItemMedia: vi.fn(),
}))
vi.mock('@/features/vehicles/Components/service-page/PhotoHandoffButton', () => ({
  PhotoHandoffButton: () => null,
}))

import { InspectionItemRow } from '@/features/inspections/Components/InspectionItemRow'

const ITEM = {
  id: 'tyres',
  name: 'Tyres',
  section: 'Wheels',
  sortOrder: 0,
  condition: 'fail',
  notes: null,
  imageUrls: [],
}

const renderRow = (quoteRequested?: boolean) =>
  render(
    <InspectionItemRow
      item={ITEM}
      scale="eu"
      isCompleted={false}
      quoteRequested={quoteRequested}
      onOpenImage={() => undefined}
      onChanged={() => undefined}
    />
  )

describe('the quote requested marker', () => {
  it('sits on a check the customer ticked', () => {
    renderRow(true)
    expect(screen.getByTestId('quote-requested-marker')).toHaveTextContent('Quote requested')
  })

  it('is absent from every other check', () => {
    renderRow()
    expect(screen.queryByTestId('quote-requested-marker')).not.toBeInTheDocument()
  })
})
