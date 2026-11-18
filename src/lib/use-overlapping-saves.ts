'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Reads the screen back from the server after overlapping changes partly
 * failed, and puts what it read on screen only while `idle()` holds: no
 * change has been made since the read began. A read that comes back after
 * another change would put an older state over it, so it returns false then,
 * and also when the read itself failed. Returns true once it has applied
 * what it read.
 */
export type ReadBack = (idle: () => boolean) => boolean | Promise<boolean>

/**
 * Sends changes a screen draws before the server has them: a drag on the
 * work board, a mark on the condition map.
 *
 * A request that never reaches the server throws instead of answering; it is
 * caught and undone like one the server refused. A change on its own is
 * undone at once. Changes that overlap (a second drag before the first
 * answered) are settled once all have answered, because undoing one by its
 * snapshot could put back what another had already changed: when every one
 * failed they are undone newest first, which leaves the screen as it was
 * before the first; when some went through, `readBack` asks the server.
 *
 * Resolves to the action's answer, or null when it never arrived.
 */
export function useOverlappingSaves(readBack: ReadBack) {
  const latestReadBack = useRef(readBack)
  useEffect(() => {
    latestReadBack.current = readBack
  }, [readBack])

  const saves = useRef({
    out: 0,
    started: 0,
    succeeded: false,
    readBackDue: false,
    failed: [] as { order: number; undo?: () => void }[],
  })

  // A change that started after the read began makes what it read stale,
  // even when that change has already answered by the time the read does;
  // counting the changes started, not only those still out, catches that.
  // A read made stale by a change that has since answered is not waited on
  // by anything, so it is made again at once. One that failed, or that a
  // change still out has made stale, waits for the next change to answer.
  const startReadBack = useCallback(() => {
    const s = saves.current
    const startedBefore = s.started
    const idle = () => s.out === 0 && s.started === startedBefore
    void Promise.resolve(latestReadBack.current(idle))
      .catch(() => false)
      .then((took) => {
        if (took) return
        if (s.out === 0 && s.started !== startedBefore) startReadBack()
        else s.readBackDue = true
      })
  }, [])

  return useCallback(
    async <R extends { success: boolean }>(
      request: () => Promise<R>,
      undo?: () => void
    ): Promise<R | null> => {
      const s = saves.current
      const order = s.started++
      s.out += 1
      const result = await request().catch(() => null)
      s.out -= 1
      if (result?.success) s.succeeded = true
      else s.failed.push({ order, undo })
      if (s.out === 0) {
        const { failed, succeeded, readBackDue } = s
        s.failed = []
        s.succeeded = false
        s.readBackDue = false
        if (failed.length > 0 && !succeeded) {
          for (const f of failed.sort((a, b) => b.order - a.order)) f.undo?.()
        }
        if ((failed.length > 0 && succeeded) || readBackDue) startReadBack()
      }
      return result
    },
    [startReadBack]
  )
}
