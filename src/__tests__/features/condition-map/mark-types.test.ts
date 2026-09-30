/**
 * The workshop's kinds of mark: the built-in eight as the workshop left
 * them, its own beside them, a kind nobody knows still drawn, and a print
 * that names and draws each mark from the catalogue it was given.
 */
import { describe, expect, it } from 'vitest'
import {
  builtinMarkTypes,
  markStyleOf,
  markTypeOf,
  markTypeRefs,
  ownMarkKey,
  resolveMarkTypes,
} from '@/features/condition-map/Lib/markTypes'
import { MARK_KINDS, MARK_STYLE, type ConditionMarkData } from '@/features/condition-map/Lib/marks'
import { conditionMapForPrint } from '@/features/condition-map/Lib/print'

const names = { dent: 'Dent', scratch: 'Scratch', chip: 'Stone chip' }

describe('the catalogue of kinds', () => {
  it('ships the eight built-in kinds, named in the reader’s language', () => {
    const types = builtinMarkTypes(names)
    expect(types.map((t) => t.key)).toEqual([...MARK_KINDS])
    expect(types[0]).toMatchObject({ key: 'dent', name: 'Dent', shape: 'circle', builtin: true })
    expect(types[0].color).toBe(MARK_STYLE.dent.color)
    expect(types.every((t) => !t.changed && !t.hidden)).toBe(true)
    // A kind with no name in this language keeps its key rather than nothing.
    expect(types.find((t) => t.key === 'rust')?.name).toBe('rust')
  })

  it("applies the workshop's changes and lists its own kinds after", () => {
    const types = resolveMarkTypes(
      [
        {
          key: 'dent',
          name: 'Ding',
          shape: 'square',
          color: '#111111',
          sortOrder: 7,
          hidden: true,
        },
        {
          key: 'own_abc',
          name: 'Curb rash',
          shape: 'hex',
          color: '#e11d48',
          sortOrder: 1,
          hidden: false,
        },
        { key: 'own_bad', name: 'Odd', shape: 'blob', color: '', sortOrder: 9, hidden: false },
      ],
      names
    )
    const dent = types.find((t) => t.key === 'dent')!
    expect(dent).toMatchObject({
      name: 'Ding',
      shape: 'square',
      color: '#111111',
      hidden: true,
      changed: true,
    })
    // Sorted by the workshop's order: the own kind at 1 comes right after scratch at 1? No: stable by sortOrder.
    expect(types.map((t) => t.key).indexOf('own_abc')).toBeLessThan(
      types.map((t) => t.key).indexOf('dent')
    )
    const odd = types.find((t) => t.key === 'own_bad')!
    // A shape or colour the app does not know falls back rather than breaking the drawing.
    expect(odd.shape).toBe('circle')
    expect(odd.color).toBe('#6b7280')
    expect(odd.builtin).toBe(false)
  })

  it('draws a kind nobody knows as a grey circle named by its key', () => {
    const types = builtinMarkTypes(names)
    expect(markTypeOf(types, 'own_gone')).toMatchObject({ name: 'own gone', shape: 'circle' })
    expect(markStyleOf(types, 'chip')).toEqual({ shape: 'triangle', color: MARK_STYLE.chip.color })
    expect(markTypeRefs(types)[0]).toEqual({
      key: 'dent',
      name: 'Dent',
      shape: 'circle',
      color: MARK_STYLE.dent.color,
    })
    expect(ownMarkKey('abc')).toBe('own_abc')
  })
})

describe('a print with the workshop’s kinds', () => {
  const mark = (over: Partial<ConditionMarkData>): ConditionMarkData => ({
    id: 'm',
    vehicleId: 'v',
    inspectionId: null,
    inspectionItemId: null,
    serviceRecordId: 's1',
    bodyType: 'sedan',
    view: 'left',
    panel: 'left_front_door',
    x: 0.5,
    y: 0.5,
    kind: 'dent',
    severity: 'minor',
    note: null,
    imageUrls: [],
    recordedAt: '2026-09-01T00:00:00Z',
    resolvedAt: null,
    ...over,
  })
  const labels = {
    views: { top: 'Top', left: 'Left', right: 'Right', front: 'Front', rear: 'Rear' },
    panels: { left_front_door: 'Left front door' },
    kinds: { dent: 'Dent' },
    severities: { minor: 'Minor', major: 'Major' },
    previous: 'earlier',
  }

  it('names the legend and shapes the glyph from the catalogue it is given', () => {
    const types = resolveMarkTypes(
      [
        {
          key: 'dent',
          name: 'Ding',
          shape: 'square',
          color: '#123456',
          sortOrder: 0,
          hidden: false,
        },
        {
          key: 'own_x',
          name: 'Curb rash',
          shape: 'hex',
          color: '#654321',
          sortOrder: 8,
          hidden: false,
        },
      ],
      { dent: 'Dent' }
    )
    const map = conditionMapForPrint({
      bodyType: 'sedan',
      marks: [
        mark({ id: 'a' }),
        mark({ id: 'b', kind: 'own_x', recordedAt: '2026-09-02T00:00:00Z' }),
      ],
      includePrevious: false,
      labels: { ...labels, types },
      width: 500,
    })!
    expect(map.rows.map((r) => r.kind)).toEqual(['Ding', 'Curb rash'])
    const strokes = map.shapes
      .filter((s) => s.type === 'path' && s.fill === '#ffffff')
      .map((s: any) => s.stroke)
    expect(strokes).toEqual(expect.arrayContaining(['#123456', '#654321']))
  })

  it('falls back to the built-in kinds when no catalogue is given', () => {
    const map = conditionMapForPrint({
      bodyType: 'sedan',
      marks: [mark({ id: 'a' })],
      includePrevious: false,
      labels,
      width: 500,
    })!
    expect(map.rows[0].kind).toBe('Dent')
    expect(map.shapes.some((s) => s.type === 'circle' && s.stroke === MARK_STYLE.dent.color)).toBe(
      true
    )
  })
})

describe('the icon of a kind', () => {
  it('draws the kind’s own shape, not a circle for everything', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const React = await import('react')
    const { MarkIcon } = await import('@/features/condition-map/Components/ConditionMap')
    const html = renderToStaticMarkup(
      React.createElement(MarkIcon, {
        type: { shape: 'triangle', color: '#7c3aed' },
        severity: 'minor',
      })
    )
    expect(html).toContain('<path')
    expect(html).not.toContain('<circle')
    expect(html).toContain('#7c3aed')
  })
})
