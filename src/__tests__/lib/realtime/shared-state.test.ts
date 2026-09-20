/**
 * @vitest-environment node
 *
 * One process, one of each.
 *
 * Next loads a module once per bundle, and development loads it again on
 * every edit. State kept in a module's own `const` is therefore several
 * things at once: `withAuth` wrote the author into one copy of the actor
 * store while the long-lived Prisma hook read another, and a browser was put
 * into one copy of the room map while changes went to the people in another.
 * Both looked like the feature simply doing nothing.
 */
import { describe, expect, it, vi } from 'vitest'

describe('state shared across bundles', () => {
  it('is the same room map when the module is loaded a second time', async () => {
    const first = await import('@/lib/realtime/rooms.server')
    vi.resetModules()
    const second = await import('@/lib/realtime/rooms.server')
    expect(second).not.toBe(first)

    const socket = { name: 'desk' }
    first.join(socket, 'org-1|rec:serviceRecord:job-1')

    // Joined through one copy, delivered through the other.
    const told: object[] = []
    second.broadcast('org-1|rec:serviceRecord:job-1', (member) => told.push(member))
    expect(told).toEqual([socket])
    first.resetRooms()
  })

  it('is the same author when the writer and the reader are different copies', async () => {
    const writer = await import('@/lib/realtime/actor.server')
    vi.resetModules()
    const reader = await import('@/lib/realtime/actor.server')
    expect(reader).not.toBe(writer)

    const christian = { userId: 'u-1', name: 'Christian', source: 'web' as const }
    const seen = await writer.runAsActor(christian, async () => reader.currentActor())

    expect(seen).toEqual(christian)
  })

  it('is the same presence when the module is loaded a second time', async () => {
    const first = await import('@/lib/realtime/presence.server')
    vi.resetModules()
    const second = await import('@/lib/realtime/presence.server')

    first.enterRoom('org-1|rec:serviceRecord:job-1', { name: 'desk' }, { userId: 'u-1', name: 'C' })

    expect(second.presenceOf('org-1|rec:serviceRecord:job-1').map((u) => u.userId)).toEqual(['u-1'])
    first.resetPresence()
  })
})
