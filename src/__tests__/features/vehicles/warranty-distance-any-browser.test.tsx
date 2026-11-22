/**
 * The distance limit in a work order's warranty line reads the same in every
 * browser. Written with the browser's own number format it was "20.000 km"
 * in Belgium where the server had sent "20,000 km", a hydration mismatch.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))

import { WarrantySection } from '@/features/vehicles/Components/service-page/WarrantySection'

// A browser set to Dutch as written in Belgium, far from the server's UTC.
const realNumber = Number.prototype.toLocaleString
const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Pacific/Kiritimati'
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
    this: number,
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions
  ) {
    return realNumber.call(this, locales ?? 'nl-BE', options)
  })
})
afterAll(() => {
  process.env.TZ = originalTz
  vi.restoreAllMocks()
})

describe('the warranty line on a work order', () => {
  it('writes the distance limit in the language of the app', () => {
    render(
      <WarrantySection
        value={{
          warrantyStatus: 'included',
          warrantyMonths: 12,
          warrantyMileage: 20000,
          warrantyNotes: null,
        }}
        onChange={vi.fn()}
        texts={{
          includedTerms: '',
          notIncludedText: '',
          defaultMonths: null,
          defaultMileage: null,
        }}
        distanceUnit="km"
      />
    )
    // Folded, the card says the warranty in one line.
    fireEvent.click(screen.getByRole('button', { expanded: true }))
    expect(screen.getByTestId('warranty-summary')).toHaveTextContent('20,000 km')
  })
})
