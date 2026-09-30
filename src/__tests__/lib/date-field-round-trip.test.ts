/**
 * A date field that is filled from what was stored and saved again must come
 * back as the same day, however many times it is saved.
 *
 * Each case pairs what the server does with the typed YYYY-MM-DD with what
 * the form does to fill its field from the stored instant, and runs the pair
 * twice. The quote's "valid until" failed exactly this way: the form read the
 * stored instant as a UTC day, the server read the field in the workshop's
 * zone, and a quote valid until the 19th went out valid until the 17th after
 * two saves in Oslo.
 */
import { describe, expect, it } from 'vitest'
import {
  inspectionDisplayDate,
  inspectionDueInput,
} from '@/features/vehicles/Lib/inspectionDueInput'
import { zonedDateInput, zonedDayKey } from '@/lib/timezone'
import { endOfWorkshopDay, toSafeWorkshopDate } from '@/lib/workshop-datetime'

const DAY = '2026-10-19'

/** Saves `day` twice through `save`, filling the field with `fill` in between. */
function saveTwice(
  day: string,
  save: (value: string) => Date | undefined,
  fill: (stored: Date) => string
): string[] {
  const days: string[] = []
  let field = day
  for (let i = 0; i < 2; i++) {
    const stored = save(field)
    if (!stored) throw new Error(`nothing stored for ${field}`)
    field = fill(stored)
    days.push(field)
  }
  return days
}

/** What the forms did before: the stored instant's UTC day. */
const utcDay = (stored: Date) => stored.toISOString().slice(0, 10)

describe('report schedule end date', () => {
  // The action stores the last moment of the chosen day on the workshop's clock.
  const save = (tz: string) => (value: string) => endOfWorkshopDay(value, tz)

  for (const tz of ['Europe/Oslo', 'America/Chicago', 'Pacific/Auckland', 'UTC']) {
    it(`keeps the same day through two saves in ${tz}`, () => {
      expect(saveTwice(DAY, save(tz), (stored) => zonedDateInput(stored, tz))).toEqual([DAY, DAY])
    })
  }

  it('drifted a day per save west of UTC when the field was filled from the UTC day', () => {
    expect(saveTwice(DAY, save('America/Chicago'), utcDay)).toEqual(['2026-10-20', '2026-10-21'])
  })
})

describe('vehicle inspection due date', () => {
  // The action stores a typed date as midnight on the workshop's clock.
  const save = (tz: string) => (value: string) => toSafeWorkshopDate(value, tz)

  for (const tz of ['Europe/Oslo', 'America/Chicago', 'Pacific/Auckland', 'UTC']) {
    it(`keeps a typed date through two saves in ${tz}`, () => {
      expect(
        saveTwice(DAY, save(tz), (stored) => inspectionDueInput(stored, 'manual', tz))
      ).toEqual([DAY, DAY])
    })

    it(`shows a registry's date as the registry gave it, and keeps it through a save, in ${tz}`, () => {
      // The registry sync stores a bare day as UTC midnight.
      const fromRegistry = new Date(DAY)
      const field = inspectionDueInput(fromRegistry, 'vegvesen', tz)
      expect(field).toBe(DAY)
      // Saving the vehicle rewrites it as a typed date, on the workshop's clock.
      expect(
        saveTwice(field, save(tz), (stored) => inspectionDueInput(stored, 'manual', tz))
      ).toEqual([DAY, DAY])
    })
  }

  it('drifted a day per save east of UTC when the field was filled from the UTC day', () => {
    expect(saveTwice(DAY, save('Europe/Oslo'), utcDay)).toEqual(['2026-10-18', '2026-10-17'])
  })

  it('leaves the field empty for a value that is not a date', () => {
    expect(inspectionDueInput('not a date', 'manual', 'Europe/Oslo')).toBe('')
  })
})

describe('inspection date as the work order shows it', () => {
  // The formatter works in the workshop's zone, so what matters is the day
  // the handed-over instant falls on there.
  for (const tz of ['Europe/Oslo', 'America/Chicago', 'Pacific/Auckland', 'UTC']) {
    it(`shows a registry's day and a typed day as that day in ${tz}`, () => {
      const registry = inspectionDisplayDate(new Date(DAY), 'rdw', tz)
      const typed = inspectionDisplayDate(toSafeWorkshopDate(DAY, tz) as Date, 'manual', tz)
      expect(registry && zonedDayKey(registry, tz)).toBe(DAY)
      expect(typed && zonedDayKey(typed, tz)).toBe(DAY)
    })
  }

  it("uses the browser's own day when the workshop has no zone", () => {
    const shown = inspectionDisplayDate(new Date(DAY), 'vegvesen', '')
    expect(shown && [shown.getFullYear(), shown.getMonth() + 1, shown.getDate()]).toEqual([
      2026, 10, 19,
    ])
  })

  it('shows nothing for a value that is not a date', () => {
    expect(inspectionDisplayDate('never', 'manual', 'Europe/Oslo')).toBeNull()
  })
})
