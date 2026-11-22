/**
 * A handler handed to a memoized part of a page must stay the same function,
 * or that part is drawn again on every render; and it must still do what the
 * newest render says, or a click acts on what the page showed a moment ago.
 */

import { act, render, renderHook } from '@testing-library/react'
import { createElement, startTransition, Suspense } from 'react'
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

  it('keeps the handler of the page on screen when a newer render is abandoned', () => {
    let handler: () => string = () => ''
    const never = new Promise<never>(() => undefined)
    function Probe({ status, suspend }: { status: string; suspend: boolean }) {
      handler = useStableCallback(() => status)
      // A render that never finishes: React keeps showing the one before it.
      if (suspend) throw never
      return null
    }
    const tree = (status: string, suspend: boolean) =>
      createElement(Suspense, { fallback: null }, createElement(Probe, { status, suspend }))

    const { rerender } = render(tree('pending', false))
    expect(handler()).toBe('pending')

    act(() => {
      startTransition(() => rerender(tree('completed', true)))
    })

    expect(handler()).toBe('pending')
  })
})
