/**
 * @vitest-environment node
 *
 * A customer's socket hears about its own thread and nothing else.
 *
 * The portal is open to anyone a workshop has as a customer, so its socket
 * is held to less than a staff member's: it is recognised by the customer's
 * session, placed by the server in its own thread's room, sent nothing but
 * "your thread changed", and allowed to say nothing but a ping. These tests
 * drive the real bus, rooms and route with pretend sockets.
 */
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: null as { customerId: string; organizationId: string } | null,
  portalLive: true,
}))
vi.mock('@/lib/customer-session', () => ({ getCustomerSession: async () => state.session }))
vi.mock('@/features/portal/Lib/portalLive', () => ({ isPortalLive: async () => state.portalLive }))
vi.mock('@/lib/db', () => ({
  db: {
    // The workshop "org1" answers at the address "fjordside" and at its id.
    organization: {
      findFirst: async ({ where }: { where: { id: string; OR: Record<string, string>[] } }) => {
        const asked = where.OR.flatMap((one) => Object.values(one))
        const known = where.id === 'org1' ? ['fjordside', 'org1'] : [where.id]
        return asked.some((value) => known.includes(value)) ? { id: where.id } : null
      },
    },
    customerSession: { findFirst: async () => ({ id: 's1' }) },
    customer: { count: async () => 1 },
  },
}))

import { UPGRADE } from '@/app/(public)/portal/[orgId]/ws/route'
import { mayJoin } from '@/lib/realtime/authorize.server'
import { publishToBus } from '@/lib/realtime/bus.server'
import type { RecordChange } from '@/lib/realtime/events'
import {
  MAX_PORTAL_SOCKETS_PER_CUSTOMER,
  joinPortalSocket,
  leavePortalSocket,
  portalSocketStats,
  publishPortalChatSwitched,
  resetPortalSockets,
} from '@/lib/realtime/portal.server'
import { flushRecordChanges } from '@/lib/realtime/publish.server'
import { resetRooms, stats } from '@/lib/realtime/rooms.server'

/** A socket as `ws` hands one over, recording what it is sent and how it ends. */
class FakeSocket extends EventEmitter {
  readyState = 1
  sent: string[] = []
  closedWith: number | null = null
  send(data: string) {
    this.sent.push(data)
  }
  ping() {
    /* the server pings; a pretend socket has nobody to answer */
  }
  close(code = 1000) {
    if (this.readyState !== 1) return
    this.readyState = 3
    this.closedWith = code
    this.emit('close', code)
  }
  terminate() {
    this.close(1006)
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

/** Opens the portal's socket the way a browser at this address would. */
async function connect(
  as: { customerId: string; organizationId: string } | null,
  address = 'fjordside'
) {
  state.session = as
  const socket = new FakeSocket()
  UPGRADE(socket as never, null, { url: `/portal/${address}/ws` } as never)
  await settle()
  return socket
}

const threadChange = (customerId: string | null, organizationId = 'org1'): RecordChange => ({
  kind: 'customer',
  id: customerId,
  organizationId,
  action: 'updated',
  by: { userId: null, name: null, source: 'system' },
  at: Date.now(),
  hint: 'portal',
})
const announce = (change: RecordChange) => publishToBus({ t: 'record', change })
const signals = (socket: FakeSocket) => socket.sent.filter((frame) => frame === '{"t":"thread"}')

const kari = { customerId: 'kari', organizationId: 'org1' }
const ola = { customerId: 'ola', organizationId: 'org1' }

beforeEach(() => {
  process.env.REALTIME_BRIDGE = 'off'
  state.portalLive = true
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  resetRooms()
  resetPortalSockets()
})

describe('opening the socket', () => {
  it('recognises a signed-in customer and says it is ready', async () => {
    const socket = await connect(kari)
    expect(socket.sent).toEqual(['{"t":"ready"}'])
    expect(socket.closedWith).toBeNull()
    expect(portalSocketStats()).toEqual({ customers: 1, sockets: 1 })
  })

  it('refuses a visitor who is not signed in', async () => {
    const socket = await connect(null)
    expect(socket.closedWith).toBe(4001)
    expect(socket.sent).toEqual([])
    expect(stats().members).toBe(0)
  })

  it("refuses a session used at another workshop's address", async () => {
    const socket = await connect({ customerId: 'eve', organizationId: 'org2' })
    expect(socket.closedWith).toBe(4001)
    expect(stats().members).toBe(0)
  })

  it('refuses when the workshop has switched its portal off', async () => {
    state.portalLive = false
    expect((await connect(kari)).closedWith).toBe(4001)
  })

  it('holds one customer to as many sockets as a person can use', async () => {
    for (let i = 0; i < MAX_PORTAL_SOCKETS_PER_CUSTOMER; i++) {
      expect((await connect(kari)).closedWith).toBeNull()
    }
    expect((await connect(kari)).closedWith).toBe(1013)
    // Another customer is not held back by it.
    expect((await connect(ola)).closedWith).toBeNull()
  })

  it('leaves nothing behind when it closes', async () => {
    const socket = await connect(kari)
    socket.close()
    expect(stats()).toEqual({ rooms: 0, members: 0, subscriptions: 0 })
    expect(portalSocketStats()).toEqual({ customers: 0, sockets: 0 })
  })
})

describe('what a customer is told', () => {
  it('hears that their own thread changed, on every page they have open', async () => {
    const phone = await connect(kari)
    const laptop = await connect(kari)
    announce(threadChange('kari'))
    expect(signals(phone)).toHaveLength(1)
    expect(signals(laptop)).toHaveLength(1)
  })

  it("never hears about another customer's thread", async () => {
    const mine = await connect(kari)
    const theirs = await connect(ola)
    announce(threadChange('ola'))
    expect(signals(mine)).toHaveLength(0)
    expect(signals(theirs)).toHaveLength(1)
  })

  it('never hears another workshop, even for a customer with the same id', async () => {
    const mine = await connect(kari)
    announce(threadChange('kari', 'org2'))
    expect(signals(mine)).toHaveLength(0)
  })

  it('is told nothing but that: no ids, no text, and none of the staff traffic', async () => {
    const socket = await connect(kari)
    announce(threadChange('kari'))
    // A job changing, a customer edited by the desk, a staff notification.
    announce({ ...threadChange('kari'), kind: 'serviceRecord' })
    announce({ ...threadChange('kari'), hint: undefined })
    publishToBus({
      t: 'legacy',
      channel: 'notification',
      data: { organizationId: 'org1', message: 'Kari Nordmann: secret' },
    })
    expect(socket.sent).toEqual(['{"t":"ready"}', '{"t":"thread"}'])
  })

  it('hears, with every customer of the workshop, that the chat was switched', async () => {
    const one = await connect(kari)
    const two = await connect(ola)
    const elsewhere = new FakeSocket()
    joinPortalSocket(elsewhere, { customerId: 'eve', organizationId: 'org2' })

    publishPortalChatSwitched('org1')
    flushRecordChanges()
    expect(signals(one)).toHaveLength(1)
    expect(signals(two)).toHaveLength(1)
    expect(signals(elsewhere)).toHaveLength(0)
    leavePortalSocket(elsewhere)
  })

  it('stops hearing once it has closed', async () => {
    const socket = await connect(kari)
    socket.close()
    announce(threadChange('kari'))
    expect(signals(socket)).toHaveLength(0)
  })
})

describe('what a customer may say', () => {
  it('answers a ping', async () => {
    const socket = await connect(kari)
    socket.emit('message', '{"t":"ping"}')
    expect(socket.sent.at(-1)).toBe('{"t":"pong"}')
  })

  it('cannot ask its way into a staff room or another thread', async () => {
    const socket = await connect(kari)
    const before = stats()
    for (const room of ['org:org1', 'rec:customer:ola', 'rec:serviceRecord:j1', 'portal:ola']) {
      socket.emit('message', JSON.stringify({ t: 'sub', rooms: [room] }))
      socket.emit('message', JSON.stringify({ t: 'enter', room }))
    }
    await settle()
    expect(stats()).toEqual(before)
    expect(socket.sent).toEqual(['{"t":"ready"}'])

    announce(threadChange('ola'))
    announce({ ...threadChange('ola'), hint: undefined })
    expect(socket.sent).toEqual(['{"t":"ready"}'])
  })

  it('is closed when it sends something large or keeps talking', async () => {
    const loud = await connect(kari)
    loud.emit('message', 'x'.repeat(500))
    expect(loud.closedWith).toBe(1008)

    const busy = await connect(kari)
    for (let i = 0; i < 40; i++) busy.emit('message', '{"t":"ping"}')
    expect(busy.closedWith).toBe(1008)
  })
})

describe('the staff socket', () => {
  it("cannot be let into a customer's portal room", async () => {
    expect(await mayJoin('portal:kari', 'org1')).toBe(false)
    expect(await mayJoin('portal:*', 'org1')).toBe(false)
  })
})
