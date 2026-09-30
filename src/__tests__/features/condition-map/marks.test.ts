/**
 * Whose marks are whose: a sheet draws its own in colour and the vehicle's
 * earlier ones in grey, never a resolved one, and a body type is guessed
 * from what the registry or the trade says.
 */
import { describe, expect, it } from 'vitest'
import {
  bodyTypeFor,
  guessBodyType,
  isDrawnOnSheet,
  markInputSchema,
  numberedMarks,
  splitMarks,
  type ConditionMarkData,
  isLaterVisit,
  markKindSchema,
} from '@/features/condition-map/Lib/marks'
import { mirrorPanel } from '@/features/condition-map/Lib/drawingTypes'

const mark = (over: Partial<ConditionMarkData>): ConditionMarkData => ({
  id: 'm',
  vehicleId: 'v',
  inspectionId: null,
  inspectionItemId: null,
  serviceRecordId: null,
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

describe('condition marks', () => {
  it("splits a sheet's own marks from the vehicle's earlier ones and drops resolved ones", () => {
    const marks = [
      mark({ id: 'a', inspectionId: 'i1', inspectionItemId: 'c1' }),
      mark({ id: 'b', inspectionId: 'i0', inspectionItemId: 'c0' }),
      mark({ id: 'c', serviceRecordId: 's1', resolvedAt: '2026-09-02T00:00:00Z' }),
      mark({ id: 'd', serviceRecordId: 's1' }),
    ]
    const onInspection = splitMarks(marks, { inspectionId: 'i1', inspectionItemId: 'c1' })
    expect(onInspection.own.map((m) => m.id)).toEqual(['a'])
    expect(onInspection.previous.map((m) => m.id)).toEqual(['b', 'd'])
    const onJob = splitMarks(marks, { serviceRecordId: 's1' })
    expect(onJob.own.map((m) => m.id)).toEqual(['d'])
    expect(onJob.previous.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('counts another map check on the same inspection as this visit, drawn on that check', () => {
    const checkin = mark({ id: 'checkin', inspectionId: 'i1', inspectionItemId: 'c1' })
    const handback = mark({ id: 'handback', inspectionId: 'i1', inspectionItemId: 'c2' })
    const scope = { inspectionId: 'i1', inspectionItemId: 'c2' }
    expect(splitMarks([checkin, handback], scope).own.map((m) => m.id)).toEqual([
      'checkin',
      'handback',
    ])
    expect(splitMarks([checkin, handback], scope).previous).toEqual([])
    expect(isDrawnOnSheet(checkin, scope)).toBe(false)
    expect(isDrawnOnSheet(handback, scope)).toBe(true)
  })

  it("counts the linked inspection's marks as the job's visit, but only the drop-off's as drawn on it", () => {
    const marks = [
      mark({ id: 'checkin', inspectionId: 'i1', inspectionItemId: 'c1' }),
      mark({ id: 'older', inspectionId: 'i0', inspectionItemId: 'c0' }),
      mark({ id: 'dropoff', serviceRecordId: 's1' }),
      mark({ id: 'otherJob', serviceRecordId: 's0' }),
    ]
    const scope = { serviceRecordId: 's1', linkedInspectionId: 'i1' }
    const onJob = splitMarks(marks, scope)
    expect(onJob.own.map((m) => m.id)).toEqual(['checkin', 'dropoff'])
    expect(onJob.previous.map((m) => m.id)).toEqual(['older', 'otherJob'])
    expect(marks.filter((m) => isDrawnOnSheet(m, scope)).map((m) => m.id)).toEqual(['dropoff'])

    // A quote has no drop-off: its visit is the inspection it came from.
    const onQuote = splitMarks(marks, { linkedInspectionId: 'i1' })
    expect(onQuote.own.map((m) => m.id)).toEqual(['checkin'])
    expect(marks.filter((m) => isDrawnOnSheet(m, { linkedInspectionId: 'i1' }))).toEqual([])

    // Nothing linked and no job: nothing is this visit's.
    expect(splitMarks(marks, {}).own).toEqual([])
    expect(splitMarks(marks, { serviceRecordId: null, linkedInspectionId: null }).own).toEqual([])
  })

  it('numbers marks by when they were recorded', () => {
    const ordered = numberedMarks([
      mark({ id: 'late', recordedAt: '2026-09-03T00:00:00Z' }),
      mark({ id: 'early', recordedAt: '2026-09-01T00:00:00Z' }),
    ])
    expect(ordered.map((m) => m.id)).toEqual(['early', 'late'])
  })

  it("guesses the drawing from the registry's word for the body, and the trade", () => {
    expect(guessBodyType('Stasjonsvogn')).toBe('estate')
    expect(guessBodyType('Pickup truck')).toBe('pickup')
    expect(guessBodyType('Kombilimousine')).toBe('hatchback')
    expect(guessBodyType('unknown thing')).toBeNull()
    expect(bodyTypeFor({ bodyType: 'van' })).toBe('van')
    expect(bodyTypeFor({ bodyType: null }, { serviceType: 'marine' })).toBe('boat')
    expect(bodyTypeFor({ bodyType: 'nonsense' }, { registryBody: 'SUV' })).toBe('suv')
    expect(bodyTypeFor({ bodyType: null })).toBe('sedan')
  })

  it('mirrors side panels and leaves shared ones alone', () => {
    expect(mirrorPanel('left_front_door')).toBe('right_front_door')
    expect(mirrorPanel('right_mirror')).toBe('left_mirror')
    expect(mirrorPanel('port_hull')).toBe('starboard_hull')
    expect(mirrorPanel('hood')).toBe('hood')
  })

  it('refuses a mark off the drawing or of an unknown kind', () => {
    const base = {
      vehicleId: 'v',
      bodyType: 'sedan',
      view: 'left',
      panel: 'left_sill',
      x: 0.2,
      y: 0.9,
      kind: 'scratch',
    }
    expect(markInputSchema.safeParse(base).success).toBe(true)
    expect(markInputSchema.safeParse({ ...base, x: 1.2 }).success).toBe(false)
    expect(markInputSchema.safeParse({ ...base, kind: 'smudge' }).success).toBe(false)
    expect(markInputSchema.safeParse({ ...base, panel: 'wing_mirror' }).success).toBe(false)
  })
})

describe('what counts as an earlier visit', () => {
  const mark = (over: Partial<ConditionMarkData>): ConditionMarkData => ({
    id: 'm',
    vehicleId: 'v',
    inspectionId: null,
    inspectionItemId: null,
    serviceRecordId: 'other-job',
    bodyType: 'sedan',
    view: 'left',
    panel: 'left_front_door',
    x: 0.5,
    y: 0.5,
    kind: 'dent',
    severity: 'minor',
    note: null,
    imageUrls: [],
    recordedAt: '2026-09-01T10:00:00Z',
    resolvedAt: null,
    ...over,
  })
  const scope = { serviceRecordId: 'this-job', openedAt: '2026-09-10T08:00:00Z' }

  it('keeps a mark from a visit opened before this one, grey', () => {
    const earlier = mark({ id: 'a', sheetOpenedAt: '2026-09-01T09:00:00Z' })
    expect(splitMarks([earlier], scope).previous.map((m) => m.id)).toEqual(['a'])
  })

  it('leaves out a mark from a visit opened after this one', () => {
    const later = mark({ id: 'b', sheetOpenedAt: '2026-09-20T09:00:00Z' })
    expect(isLaterVisit(later, scope)).toBe(true)
    expect(splitMarks([later], scope).previous).toEqual([])
  })

  it('has nothing to compare without an opening time, as before', () => {
    const later = mark({ id: 'c', sheetOpenedAt: '2026-09-20T09:00:00Z' })
    expect(splitMarks([later], { serviceRecordId: 'this-job' }).previous).toHaveLength(1)
  })
})

describe('the own-kind key', () => {
  it('takes a kind of the workshop’s own and refuses anything else', () => {
    expect(markKindSchema.safeParse('own_cmg4abc123').success).toBe(true)
    expect(markKindSchema.safeParse('dent').success).toBe(true)
    expect(markKindSchema.safeParse('own_').success).toBe(false)
    expect(markKindSchema.safeParse('own_../x').success).toBe(false)
  })
})
