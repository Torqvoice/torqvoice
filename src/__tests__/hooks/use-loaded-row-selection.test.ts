/**
 * Ticked rows belong to the list they were ticked in. Another search, filter
 * or sort is another list and starts empty, and so does going back to the
 * first one: a tick from earlier that nobody can see any more must never be
 * handed to a bulk action.
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLoadedRowSelection } from '@/hooks/use-loaded-row-selection'

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

function setup(listKey: string) {
  return renderHook(({ listKey }: { listKey: string }) => useLoadedRowSelection(rows, listKey), {
    initialProps: { listKey },
  })
}

describe('useLoadedRowSelection', () => {
  it('starts list A empty again after going to list B and back', () => {
    const { result, rerender } = setup('A')
    act(() => result.current.toggle('a'))
    act(() => result.current.toggle('c'))
    expect(result.current.selectedIds).toEqual(['a', 'c'])

    rerender({ listKey: 'B' })
    expect(result.current.selectedIds).toEqual([])
    expect(result.current.headerState).toBe(false)

    rerender({ listKey: 'A' })
    expect(result.current.selectedIds).toEqual([])
    expect(result.current.count).toBe(0)
    expect(result.current.isSelected('a')).toBe(false)
  })

  it('keeps ticks made in list B, and only those, while on B', () => {
    const { result, rerender } = setup('A')
    act(() => result.current.toggle('a'))
    rerender({ listKey: 'B' })
    act(() => result.current.toggle('b'))
    expect(result.current.selectedIds).toEqual(['b'])

    rerender({ listKey: 'A' })
    expect(result.current.selectedIds).toEqual([])
  })

  it('keeps ticks while the same list re-renders', () => {
    const { result, rerender } = setup('A')
    act(() => result.current.toggle('b'))
    rerender({ listKey: 'A' })
    expect(result.current.selectedIds).toEqual(['b'])
  })
})
