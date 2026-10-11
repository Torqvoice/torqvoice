/**
 * @vitest-environment node
 *
 * Events reaching the other app instances.
 *
 * A workshop's desk may be on one container and its technician's phone on
 * another, and neither knows the other exists. Postgres carries the event
 * between them: `pg_notify` here, `LISTEN` there. Redis would do the same job
 * and be one more thing to operate.
 *
 * What has to hold: an instance delivers its own events locally and does not
 * apply them a second time when they come back off the wire; a notification
 * stays inside the size Postgres will accept; and a write never fails because
 * the relay did.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pg = vi.hoisted(() => {
  const notifications: { channel: string; payload: string }[] = []
  const listeners: ((message: { channel: string; payload: string }) => void)[] = []
  const queries: string[] = []
  /** Kept across tests: the bridge connects once for the life of a process. */
  const listening: string[] = []
  let failNotify = false
  /** How many queries the connection has been handed and not yet answered. */
  let inFlight = 0
  let mostInFlight = 0
  class Client {
    on(event: string, handler: (arg: unknown) => void) {
      if (event === 'notification') {
        listeners.push(handler as (message: { channel: string; payload: string }) => void)
      }
    }
    async connect() {
      return undefined
    }
    async query(text: string, values?: unknown[]) {
      queries.push(text)
      inFlight++
      mostInFlight = Math.max(mostInFlight, inFlight)
      try {
        // A round trip takes time, and it is during that time that a second
        // query can arrive on the same connection.
        await new Promise((resolve) => setImmediate(resolve))
        return this.answer(text, values)
      } finally {
        inFlight--
      }
    }
    answer(text: string, values?: unknown[]) {
      if (text.startsWith('LISTEN ')) listening.push(text)
      if (text.startsWith('SELECT pg_notify')) {
        if (failNotify) throw new Error('connection lost')
        const [channel, payload] = values as [string, string]
        notifications.push({ channel, payload })
      }
      return {}
    }
    async end() {
      return undefined
    }
  }
  return {
    Client,
    notifications,
    queries,
    listening,
    /** Delivers a frame as Postgres would, to every LISTEN handler. */
    deliver(payload: string) {
      for (const listener of listeners) listener({ channel: 'torqvoice_realtime', payload })
    },
    setFailNotify(value: boolean) {
      failNotify = value
    },
    /** The most queries the connection ever held at one moment. */
    mostInFlight: () => mostInFlight,
    /**
     * Between tests, not between processes: the connection and its LISTEN
     * belong to the instance and are made once, exactly as in production.
     */
    reset() {
      notifications.length = 0
      queries.length = 0
      failNotify = false
      mostInFlight = 0
    },
  }
})

vi.mock('pg', () => ({ Client: pg.Client }))

import { INSTANCE_ID, onBusMessage, publishToBus } from '@/lib/realtime/bus.server'
import type { RecordChange } from '@/lib/realtime/events'

const change: RecordChange = {
  kind: 'serviceRecord',
  id: 'job-1',
  organizationId: 'org-1',
  action: 'updated',
  by: { userId: 'u-1', name: 'Christian', source: 'web' },
  at: 1,
}

/** Waits for the relay, which is deliberately not awaited by the publisher. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://test/test'
  pg.reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('publishing', () => {
  it('delivers here at once, without waiting for the database', async () => {
    const heard: unknown[] = []
    const stop = onBusMessage((message) => heard.push(message))

    publishToBus({ t: 'record', change })

    // Delivered before any await: a screen in this process does not wait on a
    // round trip to see a change made in this process.
    expect(heard).toEqual([{ t: 'record', change }])
    stop()
    // Let the relay finish, so its notification is not counted by the next test.
    await settle()
  })

  it('sends it on to the other instances, stamped with who sent it', async () => {
    publishToBus({ t: 'record', change })
    await settle()

    expect(pg.notifications).toHaveLength(1)
    const sent = JSON.parse(pg.notifications[0].payload)
    expect(sent).toMatchObject({ t: 'record', from: INSTANCE_ID })
    expect(pg.notifications[0].channel).toBe('torqvoice_realtime')
    // Small enough for Postgres, which refuses anything over 8000 bytes.
    expect(pg.notifications[0].payload.length).toBeLessThan(7_000)
  })

  it('listens as soon as it connects, so an instance nobody writes on still hears', async () => {
    publishToBus({ t: 'record', change })
    await settle()
    expect(pg.listening).toContain('LISTEN torqvoice_realtime')
  })

  it('sends one at a time and in order, however many are published at once', async () => {
    // A save announces several things in the same breath. The connection
    // takes one query at a time: pg queues the rest for now, warns that it
    // will stop, and from version 9 refuses them, which would lose the event
    // for every other instance.
    for (let id = 1; id <= 5; id++) {
      publishToBus({ t: 'record', change: { ...change, id: `job-${id}` } })
    }
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(pg.notifications.map((n) => JSON.parse(n.payload).change.id)).toEqual([
      'job-1',
      'job-2',
      'job-3',
      'job-4',
      'job-5',
    ])
    expect(pg.mostInFlight()).toBe(1)
  })

  it('keeps sending after one that could not be sent', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    pg.setFailNotify(true)
    publishToBus({ t: 'record', change })
    await settle()
    pg.setFailNotify(false)

    publishToBus({ t: 'record', change: { ...change, id: 'job-2' } })
    await settle()

    expect(errors).toHaveBeenCalled()
    expect(pg.notifications.map((n) => JSON.parse(n.payload).change.id)).toEqual(['job-2'])
  })

  it('does not fail the write when the relay cannot send', async () => {
    pg.setFailNotify(true)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => publishToBus({ t: 'record', change })).not.toThrow()
    await settle()

    expect(errors).toHaveBeenCalled()
  })
})

describe('receiving', () => {
  it('applies an event from another instance', async () => {
    publishToBus({ t: 'record', change })
    await settle()
    const heard: unknown[] = []
    const stop = onBusMessage((message) => heard.push(message))

    pg.deliver(JSON.stringify({ t: 'record', change, from: 'another-instance' }))

    expect(heard).toEqual([{ t: 'record', change }])
    stop()
  })

  it('ignores its own, which it has already delivered', async () => {
    publishToBus({ t: 'record', change })
    await settle()
    const heard: unknown[] = []
    const stop = onBusMessage((message) => heard.push(message))

    pg.deliver(JSON.stringify({ t: 'record', change, from: INSTANCE_ID }))

    expect(heard).toEqual([])
    stop()
  })

  it('shrugs off a frame it cannot read', async () => {
    publishToBus({ t: 'record', change })
    await settle()
    const heard: unknown[] = []
    const stop = onBusMessage((message) => heard.push(message))

    expect(() => pg.deliver('{ not json')).not.toThrow()

    expect(heard).toEqual([])
    stop()
  })
})
