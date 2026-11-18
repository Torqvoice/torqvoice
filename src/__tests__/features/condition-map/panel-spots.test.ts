import { describe, expect, it } from 'vitest'
import { getBodyDrawing } from '@/features/condition-map/Drawings'
import { BODY_TYPES, VIEW_SIZE } from '@/features/condition-map/Lib/drawingTypes'
import { isOnPanel, panelSpots } from '@/features/condition-map/Lib/panelSpots'

/**
 * A mark added from the Panel list is put on the panel without anybody
 * pointing at it. The spot it gets must be on that panel: a mark saved as
 * "front wheel" and drawn on the fender is a wrong record of the damage.
 */
describe('the spot a panel gives a mark', () => {
  it.each(BODY_TYPES)('is on the panel itself, for every panel of a %s', (body) => {
    const drawing = getBodyDrawing(body)
    const off = panelSpots(drawing)
      .filter((spot) => !isOnPanel(drawing, spot))
      .map((spot) => `${spot.view}:${spot.panel}`)
    expect(off).toEqual([])
  })

  it('puts a motorcycle front wheel mark on the wheel, not on the fender between its halves', () => {
    const drawing = getBodyDrawing('motorcycle')
    const wheel = panelSpots(drawing).find((s) => s.view === 'top' && s.panel === 'front_wheel')
    expect(wheel).toBeDefined()
    // Seen from above the wheel is two strips with the fender (158 to 262)
    // over the middle of it.
    const x = (wheel?.x ?? 0) * VIEW_SIZE
    expect(x < 158 || x > 262).toBe(true)
  })
})
