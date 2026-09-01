/**
 * Tests for useDebouncedSearch — the live-search input used by every list page.
 *
 * The subtle case this guards is a race between typing and navigation: the
 * committed term round-trips through the server and comes back as the `initial`
 * prop. If the hook adopted that echo blindly it would overwrite whatever the
 * user typed in the meantime, and the input would visibly drop characters.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

const DELAY = 350

describe('useDebouncedSearch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('commits once after typing pauses', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useDebouncedSearch('', onCommit, DELAY))

    act(() => result.current.setValue('bra'))
    act(() => result.current.setValue('brak'))
    act(() => result.current.setValue('brake'))
    expect(onCommit).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(DELAY))
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('brake')
  })

  it('does not clobber characters typed while the search navigates', () => {
    const onCommit = vi.fn()
    const { result, rerender } = renderHook(
      ({ initial }) => useDebouncedSearch(initial, onCommit, DELAY),
      { initialProps: { initial: '' } }
    )

    act(() => result.current.setValue('brak'))
    act(() => void vi.advanceTimersByTime(DELAY))
    expect(onCommit).toHaveBeenCalledWith('brak')

    // User keeps typing before the server responds...
    act(() => result.current.setValue('brake'))
    // ...and the committed term now arrives back as a prop.
    rerender({ initial: 'brak' })

    // The extra character must survive.
    expect(result.current.value).toBe('brake')
  })

  it('still adopts a genuinely external URL change (back button, reset)', () => {
    const onCommit = vi.fn()
    const { result, rerender } = renderHook(
      ({ initial }) => useDebouncedSearch(initial, onCommit, DELAY),
      { initialProps: { initial: 'brake' } }
    )

    expect(result.current.value).toBe('brake')
    rerender({ initial: '' })
    expect(result.current.value).toBe('')
  })

  it('does not re-commit the term the server already applied', () => {
    const onCommit = vi.fn()
    renderHook(() => useDebouncedSearch('brake', onCommit, DELAY))
    act(() => void vi.advanceTimersByTime(DELAY * 2))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commitNow fires immediately and cancels the pending debounce', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useDebouncedSearch('', onCommit, DELAY))

    act(() => result.current.setValue('brake'))
    act(() => result.current.commitNow())
    expect(onCommit).toHaveBeenCalledTimes(1)

    // The already-scheduled timer must not fire a duplicate navigation.
    act(() => void vi.advanceTimersByTime(DELAY * 2))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('clearing the input commits undefined so the param is removed', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useDebouncedSearch('brake', onCommit, DELAY))

    act(() => result.current.setValue(''))
    act(() => void vi.advanceTimersByTime(DELAY))
    expect(onCommit).toHaveBeenCalledWith(undefined)
  })

  it('treats a trailing space as the same search', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useDebouncedSearch('brake', onCommit, DELAY))

    act(() => result.current.setValue('brake '))
    act(() => void vi.advanceTimersByTime(DELAY * 2))
    expect(onCommit).not.toHaveBeenCalled()
  })
})
