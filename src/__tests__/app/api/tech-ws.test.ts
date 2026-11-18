/**
 * @vitest-environment node
 *
 * The technician app's live-updates socket opens for a technician whose token
 * rides in the WebSocket subprotocol. next-ws hands the handler a NextRequest,
 * so the token is read from Fetch Headers, as a phone's handshake sends it.
 */
import { EventEmitter } from 'node:events'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getSession: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: state.getSession } } }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { on: () => undefined } }))
vi.mock('@/lib/db', () => ({
  db: {
    organizationMember: {
      findFirst: async ({ where }: { where: { organizationId?: string } }) =>
        where.organizationId && where.organizationId !== 'org1' ? null : { organizationId: 'org1' },
    },
    technician: { findFirst: async () => ({ id: 't1' }) },
  },
}))

import { UPGRADE } from '@/app/api/v1/tech/ws/route'

class FakeSocket extends EventEmitter {
  readyState = 1
  sent: string[] = []
  closedWith: { code: number; reason: string } | null = null
  send(frame: string) {
    this.sent.push(frame)
  }
  ping() {
    /* nobody answers */
  }
  close(code = 1000, reason = '') {
    this.readyState = 3
    this.closedWith = { code, reason }
    this.emit('close', code)
  }
  terminate() {
    this.close(1006)
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5))
const hex = (text: string) => Buffer.from(text, 'utf8').toString('hex')

async function connect(protocols?: string) {
  const socket = new FakeSocket()
  const request = new NextRequest('http://localhost/api/v1/tech/ws', {
    headers: protocols ? { 'sec-websocket-protocol': protocols } : {},
  })
  UPGRADE(socket as never, null, request)
  await settle()
  return socket
}

describe('technician socket', () => {
  beforeEach(() => {
    state.getSession.mockReset()
    state.getSession.mockResolvedValue({ user: { id: 'u1' }, session: {} })
  })

  it('opens for a technician whose token is in the subprotocol', async () => {
    const socket = await connect(`bearer.${hex('session-token')}, org.org1`)

    expect(socket.closedWith).toBeNull()
    expect(socket.sent).toContain(JSON.stringify({ type: 'ready' }))
    const headers = state.getSession.mock.calls[0][0].headers as Headers
    expect(headers.get('authorization')).toBe('Bearer session-token')
  })

  it('closes when no token is offered', async () => {
    const socket = await connect()

    expect(socket.closedWith).toEqual({ code: 4001, reason: 'No token' })
    expect(state.getSession).not.toHaveBeenCalled()
  })

  it('closes when the session is not valid', async () => {
    state.getSession.mockResolvedValue(null)
    const socket = await connect(`bearer.${hex('expired')}`)

    expect(socket.closedWith).toEqual({ code: 4001, reason: 'Invalid or expired session' })
  })
})
