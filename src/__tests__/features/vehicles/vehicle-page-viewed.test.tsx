/**
 * Every vehicle page opened is counted with the layout it was drawn in, so
 * the classic page can be retired once nobody is left on it.
 */
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const track = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics', () => ({ track }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { VehiclePageViewed } from '@/features/vehicles/Components/VehiclePageLayoutSwitch'

beforeEach(() => {
  track.mockReset()
})

describe('counting vehicle page views by layout', () => {
  it('says a workshop is on the classic page because nobody there has tried the new one', () => {
    render(<VehiclePageViewed vehicleId="v1" layout="classic" chosen={false} />)
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('vehicle_page:page_view', {
      layout: 'classic',
      layout_chosen: false,
    })
  })

  it('says when the classic page was picked on purpose', () => {
    render(<VehiclePageViewed vehicleId="v1" layout="classic" chosen />)
    expect(track).toHaveBeenCalledWith('vehicle_page:page_view', {
      layout: 'classic',
      layout_chosen: true,
    })
  })

  it('counts one view while the page renders again for another of its lists', () => {
    const { rerender } = render(<VehiclePageViewed vehicleId="v1" layout="modern" chosen={false} />)
    rerender(<VehiclePageViewed vehicleId="v1" layout="modern" chosen={false} />)
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('counts another vehicle, and the page a switch of layout lands on', () => {
    const { rerender } = render(
      <VehiclePageViewed vehicleId="v1" layout="classic" chosen={false} />
    )
    rerender(<VehiclePageViewed vehicleId="v2" layout="classic" chosen={false} />)
    rerender(<VehiclePageViewed vehicleId="v2" layout="modern" chosen />)
    expect(track.mock.calls.map(([, properties]) => properties)).toEqual([
      { layout: 'classic', layout_chosen: false },
      { layout: 'classic', layout_chosen: false },
      { layout: 'modern', layout_chosen: true },
    ])
  })

  it('sends nothing that identifies the vehicle', () => {
    render(<VehiclePageViewed vehicleId="v-secret" layout="modern" chosen={false} />)
    expect(JSON.stringify(track.mock.calls)).not.toContain('v-secret')
  })
})
