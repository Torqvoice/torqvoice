/**
 * Tests for useDeferredCommit — the pause detector behind the parts editor's
 * margin field.
 *
 * The case it guards is a field derived from another that updates on every
 * keystroke. Entering a cost of 1500 against a price of 1000 passes through 1,
 * and a margin honestly derived from a cost of 1 reads 99900%. Restating the
 * margin only once typing stops keeps those intermediate values off screen
 * without making anyone leave the field to see the real one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDeferredCommit } from '@/hooks/use-deferred-commit'

const DELAY = 400

describe('useDeferredCommit', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs the work once, after typing pauses', () => {
    const work = vi.fn()
    const { result } = renderHook(() => useDeferredCommit(DELAY))

    // Four keystrokes of "1500", each replacing the last scheduled restate.
    act(() => result.current.schedule(work))
    act(() => result.current.schedule(work))
    act(() => result.current.schedule(work))
    act(() => result.current.schedule(work))
    expect(work).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(DELAY))
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('does not run while keystrokes keep arriving', () => {
    const work = vi.fn()
    const { result } = renderHook(() => useDeferredCommit(DELAY))

    act(() => result.current.schedule(work))
    act(() => void vi.advanceTimersByTime(DELAY - 1))
    act(() => result.current.schedule(work))
    act(() => void vi.advanceTimersByTime(DELAY - 1))
    expect(work).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(1))
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('runs the latest work, not an earlier one', () => {
    const stale = vi.fn()
    const latest = vi.fn()
    const { result } = renderHook(() => useDeferredCommit(DELAY))

    act(() => result.current.schedule(stale))
    act(() => result.current.schedule(latest))
    act(() => void vi.advanceTimersByTime(DELAY))

    expect(stale).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
  })

  it('drops the pending work when cancelled', () => {
    const work = vi.fn()
    const { result } = renderHook(() => useDeferredCommit(DELAY))

    act(() => result.current.schedule(work))
    act(() => result.current.cancel())
    act(() => void vi.advanceTimersByTime(DELAY * 4))

    expect(work).not.toHaveBeenCalled()
  })

  it('runs pending work immediately on flush, and only once', () => {
    const work = vi.fn()
    const { result } = renderHook(() => useDeferredCommit(DELAY))

    act(() => result.current.schedule(work))
    act(() => result.current.flush())
    expect(work).toHaveBeenCalledTimes(1)

    // The timer must not fire it a second time.
    act(() => void vi.advanceTimersByTime(DELAY * 4))
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('does nothing on flush with nothing pending', () => {
    const { result } = renderHook(() => useDeferredCommit(DELAY))
    expect(() => act(() => result.current.flush())).not.toThrow()
  })

  it('does not fire after the row is unmounted mid-edit', () => {
    const work = vi.fn()
    const { result, unmount } = renderHook(() => useDeferredCommit(DELAY))

    act(() => result.current.schedule(work))
    unmount()
    act(() => void vi.advanceTimersByTime(DELAY * 4))

    expect(work).not.toHaveBeenCalled()
  })
})
