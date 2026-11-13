/**
 * Overlapping changes on a screen that draws them first (the work board, the
 * condition map). When some went through and some did not, the screen is read
 * back from the server. A read that a newer change overtook must not be put
 * on screen, even when that change has already answered by the time the read
 * does, or the older state covers the newer change with nothing left to
 * correct it.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useOverlappingSaves } from '@/lib/use-overlapping-saves'

type Result = { success: boolean }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function setup() {
  const reads: { idle: () => boolean; answer: (took: boolean) => void }[] = []
  const readBack = vi.fn(
    (idle: () => boolean) =>
      new Promise<boolean>((answer) => {
        reads.push({ idle, answer })
      })
  )
  const { result } = renderHook(() => useOverlappingSaves(readBack))
  return { save: result.current, readBack, reads }
}

/** Two overlapping changes, the first refused and the second saved. */
async function mixedPair(save: ReturnType<typeof setup>['save'], undo: () => void) {
  const refused = deferred<Result>()
  const saved = deferred<Result>()
  let first!: Promise<Result | null>
  let second!: Promise<Result | null>
  act(() => {
    first = save(() => refused.promise, undo)
    second = save(() => saved.promise)
  })
  await act(async () => {
    saved.resolve({ success: true })
    await second
    refused.resolve({ success: false })
    await first
  })
}

describe('useOverlappingSaves', () => {
  it('reads back instead of undoing when overlapping changes partly failed', async () => {
    const { save, readBack, reads } = setup()
    const undo = vi.fn()

    await mixedPair(save, undo)

    expect(undo).not.toHaveBeenCalled()
    expect(readBack).toHaveBeenCalledTimes(1)
    expect(reads[0].idle()).toBe(true)
  })

  it('reads again when a change started and finished while the read was out', async () => {
    const { save, readBack, reads } = setup()
    await mixedPair(save, vi.fn())

    // Another drag saves while the board is being read.
    await act(async () => {
      await save(async () => ({ success: true }))
    })

    // What the first read brought is older than that drag.
    expect(reads[0].idle()).toBe(false)
    await act(async () => {
      reads[0].answer(false)
    })

    expect(readBack).toHaveBeenCalledTimes(2)
    expect(reads[1].idle()).toBe(true)
  })

  it('tries a failed read again once the next change has answered', async () => {
    const { save, readBack, reads } = setup()
    await mixedPair(save, vi.fn())

    // Nothing changed meanwhile; the read itself failed.
    await act(async () => {
      reads[0].answer(false)
    })
    expect(readBack).toHaveBeenCalledTimes(1)

    await act(async () => {
      await save(async () => ({ success: true }))
    })
    expect(readBack).toHaveBeenCalledTimes(2)
  })

  it('undoes a lone failure at once, without reading back', async () => {
    const { save, readBack } = setup()
    const undo = vi.fn()

    await act(async () => {
      await save(async () => {
        throw new TypeError('Failed to fetch')
      }, undo)
    })

    expect(undo).toHaveBeenCalledTimes(1)
    expect(readBack).not.toHaveBeenCalled()
  })
})
