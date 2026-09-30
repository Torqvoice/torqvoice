/**
 * @vitest-environment node
 *
 * Rooms exist only while somebody is in them.
 *
 * A room is per record, and a workshop opens thousands of records a month.
 * If a room outlived its occupants the server would accumulate one entry per
 * work order anybody ever opened, which is a leak that shows up as a restart
 * in month three rather than as a failure anybody can trace. So the rule is
 * absolute: the last socket out takes the room with it, and a socket that
 * closes takes all of its rooms.
 *
 * `stats()` is the proof, and these tests read it after every path out.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  broadcast,
  isInRoom,
  join,
  leave,
  leaveAll,
  MAX_ROOMS_PER_SOCKET,
  membersOf,
  resetRooms,
  roomsOf,
  stats,
} from '@/lib/realtime/rooms.server'

const socket = (name: string) => ({ name })

afterEach(() => resetRooms())

describe('joining and leaving', () => {
  it('puts a socket in a room and takes it out again, leaving nothing', () => {
    const desk = socket('desk')
    expect(join(desk, 'rec:serviceRecord:1')).toBe(true)
    expect(isInRoom(desk, 'rec:serviceRecord:1')).toBe(true)
    expect(stats()).toEqual({ rooms: 1, members: 1, subscriptions: 1 })

    leave(desk, 'rec:serviceRecord:1')

    expect(isInRoom(desk, 'rec:serviceRecord:1')).toBe(false)
    expect(stats()).toEqual({ rooms: 0, members: 0, subscriptions: 0 })
  })

  it('keeps the room while anybody is still in it', () => {
    const desk = socket('desk')
    const bay = socket('bay')
    join(desk, 'rec:serviceRecord:1')
    join(bay, 'rec:serviceRecord:1')

    leave(desk, 'rec:serviceRecord:1')

    expect(membersOf('rec:serviceRecord:1').size).toBe(1)
    expect(stats().rooms).toBe(1)

    leave(bay, 'rec:serviceRecord:1')
    expect(stats()).toEqual({ rooms: 0, members: 0, subscriptions: 0 })
  })

  it('drops everything a closing socket held, in one call', () => {
    const desk = socket('desk')
    for (const id of ['1', '2', '3']) join(desk, `rec:serviceRecord:${id}`)
    join(desk, 'org:org-1')

    expect(leaveAll(desk).sort()).toEqual([
      'org:org-1',
      'rec:serviceRecord:1',
      'rec:serviceRecord:2',
      'rec:serviceRecord:3',
    ])
    expect(stats()).toEqual({ rooms: 0, members: 0, subscriptions: 0 })
  })

  it('survives a month of work orders opened and closed', () => {
    const desk = socket('desk')
    for (let i = 0; i < 2_000; i++) {
      const room = `rec:serviceRecord:${i}`
      join(desk, room)
      leave(desk, room)
    }
    expect(stats()).toEqual({ rooms: 0, members: 0, subscriptions: 0 })
  })

  it('is safe to leave twice, or to leave what was never joined', () => {
    const desk = socket('desk')
    join(desk, 'rec:quote:9')
    leave(desk, 'rec:quote:9')
    leave(desk, 'rec:quote:9')
    leave(socket('nobody'), 'rec:quote:9')
    expect(leaveAll(socket('nobody'))).toEqual([])
    expect(stats()).toEqual({ rooms: 0, members: 0, subscriptions: 0 })
  })
})

describe('the limit on one socket', () => {
  it('refuses more rooms than any page needs, so a bad client cannot grow the map', () => {
    const rogue = socket('rogue')
    for (let i = 0; i < MAX_ROOMS_PER_SOCKET; i++) {
      expect(join(rogue, `rec:serviceRecord:${i}`)).toBe(true)
    }
    expect(join(rogue, 'rec:serviceRecord:too-many')).toBe(false)
    expect(roomsOf(rogue).size).toBe(MAX_ROOMS_PER_SOCKET)
    expect(stats().rooms).toBe(MAX_ROOMS_PER_SOCKET)
  })

  it('still lets it re-join a room it already holds', () => {
    const rogue = socket('rogue')
    for (let i = 0; i < MAX_ROOMS_PER_SOCKET; i++) join(rogue, `rec:serviceRecord:${i}`)
    expect(join(rogue, 'rec:serviceRecord:0')).toBe(true)
  })
})

describe('broadcast', () => {
  it('reaches everyone in the room and nobody else', () => {
    const desk = socket('desk')
    const bay = socket('bay')
    const elsewhere = socket('elsewhere')
    join(desk, 'rec:serviceRecord:1')
    join(bay, 'rec:serviceRecord:1')
    join(elsewhere, 'rec:serviceRecord:2')

    const told: string[] = []
    const reached = broadcast('rec:serviceRecord:1', (member) =>
      told.push((member as { name: string }).name)
    )

    expect(reached).toBe(2)
    expect(told.sort()).toEqual(['bay', 'desk'])
  })

  it('costs nothing for a room nobody is in', () => {
    expect(broadcast('rec:serviceRecord:cold', () => undefined)).toBe(0)
    expect(stats().rooms).toBe(0)
  })
})

describe('a room belongs to a workshop', () => {
  it('is kept under the workshop, and read back apart', async () => {
    const { parseTenantRoom, tenantRoom } = await import('@/lib/realtime/rooms.server')
    const key = tenantRoom('org-1', 'rec:serviceRecord:job-1')
    expect(key).toBe('org-1|rec:serviceRecord:job-1')
    expect(parseTenantRoom(key)).toEqual({
      organizationId: 'org-1',
      room: 'rec:serviceRecord:job-1',
    })
  })

  it('refuses a workshop id that could be mistaken for part of the room', async () => {
    const { parseTenantRoom, tenantRoom } = await import('@/lib/realtime/rooms.server')
    expect(() => tenantRoom('', 'rec:serviceRecord:job-1')).toThrow()
    expect(() => tenantRoom('org-1|org-2', 'rec:serviceRecord:job-1')).toThrow()
    expect(parseTenantRoom('no separator')).toBeNull()
    expect(parseTenantRoom('|rec:serviceRecord:job-1')).toBeNull()
  })
})
