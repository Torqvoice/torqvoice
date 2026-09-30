/**
 * Path data through the map's transforms: a mirror flips arcs the right
 * way, a quarter turn keeps a circle a circle, and relative commands come
 * out absolute so the renderer never has to think about them.
 */
import { describe, expect, it } from 'vitest'
import {
  applyPoint,
  compose,
  invert,
  mirrorX,
  rotate90,
  scale,
  transformPath,
  translate,
} from '@/features/condition-map/Lib/pathTransform'

describe('path transforms', () => {
  it('mirrors points across the axis and flips an arc sweep', () => {
    const m = mirrorX(500)
    expect(applyPoint(m, 100, 40)).toEqual([900, 40])
    expect(transformPath('M100 40A10 10 0 0 1 120 40', m)).toBe('M900 40A10 10 0 0 0 880 40')
  })

  it('turns a quarter clockwise and scales arc radii with the drawing', () => {
    const m = compose(scale(2), rotate90())
    expect(applyPoint(m, 10, 0)).toEqual([0, 20])
    expect(transformPath('M0 0A5 5 0 0 1 10 0', m)).toBe('M0 0A10 10 90 0 1 0 20')
  })

  it('makes relative commands absolute and turns H and V into lines', () => {
    expect(transformPath('m10 10h20v5l-5 5z', translate(1, 1))).toBe('M11 11L31 11L31 16L26 21Z')
    expect(transformPath('M0 0c1 2 3 4 5 6', translate(0, 0))).toBe('M0 0C1 2 3 4 5 6')
  })

  it('inverts what it composes', () => {
    const m = compose(translate(300, -20), compose(scale(0.5), mirrorX(500)))
    const [x, y] = applyPoint(m, 123, 456)
    const [bx, by] = applyPoint(invert(m), x, y)
    expect(bx).toBeCloseTo(123)
    expect(by).toBeCloseTo(456)
  })
})
