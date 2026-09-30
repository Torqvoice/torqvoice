/**
 * @vitest-environment node
 *
 * Who the live socket talks to.
 *
 * Every member of the workshop may connect, because that is how a page stays
 * current for whoever is at it: the work board channel says only which record
 * changed, and each listener reads it back through the actions that check
 * that listener's own permissions.
 *
 * The notification feed is different. It is the workshop's inbox, and
 * getNotifications hands it to owners and admins only, so the socket must not
 * push it to anyone else. Both sides read the rule from one place; this test
 * holds the rule and the fact that neither side has grown its own copy.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readsNotifications } from '@/lib/notification-roles'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf-8')
const SOCKET = 'src/app/api/protected/ws/route.ts'
const ACTION = 'src/features/notifications/Actions/notificationActions.ts'
const PROTOCOL = 'src/lib/realtime/protocol.server.ts'

describe('the notification feed', () => {
  it('is for the roles that can already read it', () => {
    for (const role of ['owner', 'admin', 'super_admin']) {
      expect(readsNotifications(role), role).toBe(true)
    }
    for (const role of ['member', 'technician', 'viewer', '', null, undefined]) {
      expect(readsNotifications(role), String(role)).toBe(false)
    }
  })

  it('is filtered by the socket before a frame goes out', () => {
    const source = read(SOCKET)
    // The feed travels with the other workshop-wide channels; the filter sits
    // on the send, so a member who is not an owner or admin simply is not
    // among the sockets it reaches.
    const relay = source.slice(source.indexOf("if (message.t !== 'legacy') return"))
    expect(relay).toMatch(/channel === 'notification' && !readsNotifications\(socket\.role\)/)
  })

  it('and the action and the socket share the one rule', () => {
    for (const file of [SOCKET, ACTION]) {
      expect(read(file), file).toMatch(/from '@\/lib\/notification-roles'/)
      // No second copy of the role list anywhere near either of them.
      expect(read(file), file).not.toMatch(/role === 'owner'/)
    }
  })
})

describe('what every member hears', () => {
  it('connects, whatever their role', () => {
    // A front desk on a lesser role has to see a work order stay current.
    expect(read(SOCKET)).not.toMatch(/Insufficient role/)
  })

  it('is given only the rooms it asked for, and only its own workshop’s', () => {
    // A record's change goes to that record's room and its workshop's room,
    // never to every socket on the instance.
    const source = read(SOCKET)
    expect(source).toMatch(/recordRoom\(change\.kind, change\.id\)/)
    expect(source).toMatch(/orgRoom\(change\.organizationId\)/)
    // And a room is only joined after the server has checked it belongs to
    // this socket's workshop (the protocol, which the route hands frames to).
    expect(read(PROTOCOL)).toMatch(/await mayJoin\(room, client\.organizationId\)/)
  })
})
