/**
 * A handler handed to a memoized part of a page must stay the same function,
 * or that part is drawn again on every render; and it must still do what the
 * newest render says, or a click acts on what the page showed a moment ago.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStableCallback } from '@/hooks/use-stable-callback'

describe('useStableCallback', () => {
  it('stays the same function while what it does follows the latest render', () => {
    const { result, rerender } = renderHook(
      ({ status }: { status: string }) => useStableCallback((suffix: string) => status + suffix),
      { initialProps: { status: 'pending' } }
    )
    const first = result.current
    expect(first('!')).toBe('pending!')

    rerender({ status: 'completed' })

    expect(result.current).toBe(first)
    expect(first('!')).toBe('completed!')
  })
})
