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
    const listener = source.slice(
      source.indexOf("notificationBus.on('notification'"),
      source.indexOf("notificationBus.on('workboard'")
    )
    expect(listener).toMatch(/readsNotifications\(client\.role\)/)
  })

  it('and the action and the socket share the one rule', () => {
    for (const file of [SOCKET, ACTION]) {
      expect(read(file), file).toMatch(/from '@\/lib\/notification-roles'/)
      // No second copy of the role list anywhere near either of them.
      expect(read(file), file).not.toMatch(/role === 'owner'/)
    }
  })
})

describe('the work board channel', () => {
  it('reaches every member, so a work order stays current for whoever is at it', () => {
    const source = read(SOCKET)
    // The connection is not refused by role any more.
    expect(source).not.toMatch(/Insufficient role/)
    const listener = source.slice(
      source.indexOf("notificationBus.on('workboard'"),
      source.indexOf("notificationBus.on('broadcast'")
    )
    expect(listener).not.toMatch(/readsNotifications/)
    // Still only the workshop the event belongs to.
    expect(listener).toMatch(/client\.organizationId === event\.organizationId/)
  })
})
