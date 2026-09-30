/**
 * @vitest-environment node
 *
 * A change is announced when its transaction commits, never before.
 *
 * A viewer answers an event by reading the record again, at once. Told while
 * the transaction was still open, it read the row as it was before the save,
 * showed that, and was never told again: the update simply looked lost, some
 * of the time, depending on which was quicker. That is the kind of fault that
 * is never reproduced on a developer's machine and always on a busy server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sent: { id: string | null }[] = []
vi.mock('@/lib/realtime/bus.server', () => ({
  publishToBus: (message: { change: { id: string | null } }) => sent.push(message.change),
}))

import {
  flushRecordChanges,
  holdingChanges,
  publishRecordChange,
} from '@/lib/realtime/publish.server'

const change = (id: string) => ({ kind: 'serviceRecord' as const, id, organizationId: 'org-1' })
const ids = () => sent.map((entry) => entry.id)

beforeEach(() => {
  sent.length = 0
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  flushRecordChanges()
  vi.restoreAllMocks()
})

describe('inside a transaction', () => {
  it('says nothing until it has committed', async () => {
    let commit: () => void = () => undefined
    const transaction = holdingChanges(async () => {
      publishRecordChange(change('job-1'))
      await new Promise<void>((resolve) => {
        commit = resolve
      })
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    flushRecordChanges()
    expect(ids()).toEqual([])

    commit()
    await transaction
    flushRecordChanges()

    expect(ids()).toEqual(['job-1'])
  })

  it('says nothing at all when it rolls back', async () => {
    await expect(
      holdingChanges(async () => {
        publishRecordChange(change('job-1'))
        throw new Error('constraint failed')
      })
    ).rejects.toThrow('constraint failed')
    flushRecordChanges()

    expect(ids()).toEqual([])
  })

  it('follows the write five calls down, without being passed anything', async () => {
    const deep = async (n: number): Promise<void> => {
      await Promise.resolve()
      if (n > 0) return deep(n - 1)
      publishRecordChange(change('job-1'))
    }
    let during: (string | null)[] = []
    await holdingChanges(async () => {
      await deep(5)
      flushRecordChanges()
      during = ids()
    })
    flushRecordChanges()

    expect(during).toEqual([])
    expect(ids()).toEqual(['job-1'])
  })

  it('says a record once however many of its rows were written', async () => {
    await holdingChanges(async () => {
      for (let i = 0; i < 20; i++) publishRecordChange(change('job-1'))
    })
    flushRecordChanges()
    expect(ids()).toEqual(['job-1'])
  })

  it('belongs to the outer transaction when one is inside another', async () => {
    let afterInner: (string | null)[] = ['not checked']
    await holdingChanges(async () => {
      await holdingChanges(async () => publishRecordChange(change('job-1')))
      flushRecordChanges()
      afterInner = ids()
    })
    flushRecordChanges()

    expect(afterInner).toEqual([])
    expect(ids()).toEqual(['job-1'])
  })

  it('does not swallow a write that outlives its transaction', async () => {
    let late: () => void = () => undefined
    await holdingChanges(async () => {
      void new Promise<void>((resolve) => {
        late = resolve
      }).then(() => publishRecordChange(change('job-late')))
    })
    late()
    await new Promise((resolve) => setTimeout(resolve, 5))
    flushRecordChanges()

    expect(ids()).toEqual(['job-late'])
  })
})

describe('outside a transaction', () => {
  it('is announced on the next tick, as before', () => {
    publishRecordChange(change('job-1'))
    flushRecordChanges()
    expect(ids()).toEqual(['job-1'])
  })

  it('keeps two transactions at once apart', async () => {
    let commitA: () => void = () => undefined
    const a = holdingChanges(async () => {
      publishRecordChange(change('job-a'))
      await new Promise<void>((resolve) => {
        commitA = resolve
      })
    })
    await holdingChanges(async () => publishRecordChange(change('job-b')))
    flushRecordChanges()
    expect(ids()).toEqual(['job-b'])

    commitA()
    await a
    flushRecordChanges()
    expect(ids()).toEqual(['job-b', 'job-a'])
  })
})
