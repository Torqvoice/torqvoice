/**
 * An address under a workshop's portal that is not one of its pages ends on
 * the portal's own not-found page, never on the app's 404 with its link to
 * the workshop's dashboard.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import { notFound } from 'next/navigation'
import PortalUnknownPage from '@/app/(public)/portal/[orgId]/[...missing]/page'

describe('an unknown portal address', () => {
  it('is handed to the portal not-found page', () => {
    expect(() => PortalUnknownPage()).toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledOnce()
  })
})
