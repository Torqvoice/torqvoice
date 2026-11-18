import { describe, expect, it } from 'vitest'
import { NEW_VEHICLE_PAGE_FROM, parseVehiclePageLayout } from '@/lib/vehicle-page-layout'

const before = new Date(NEW_VEHICLE_PAGE_FROM.getTime() - 86_400_000)
const after = new Date(NEW_VEHICLE_PAGE_FROM.getTime() + 86_400_000)

describe('which vehicle page a browser gets', () => {
  it('keeps a workshop that already knew the classic page on it', () => {
    expect(parseVehiclePageLayout(undefined, before)).toBe('classic')
  })

  it('starts a workshop made after the new page shipped on the new page', () => {
    expect(parseVehiclePageLayout(undefined, after)).toBe('modern')
  })

  it("follows the person's own choice either way", () => {
    expect(parseVehiclePageLayout('modern', before)).toBe('modern')
    expect(parseVehiclePageLayout('classic', after)).toBe('classic')
  })

  it('treats a cookie it does not recognise as no choice', () => {
    expect(parseVehiclePageLayout('fancy', before)).toBe('classic')
    expect(parseVehiclePageLayout('fancy', after)).toBe('modern')
  })

  it('keeps the classic page when the workshop is unknown', () => {
    expect(parseVehiclePageLayout(undefined, null)).toBe('classic')
  })
})
