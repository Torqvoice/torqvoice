/**
 * @vitest-environment node
 *
 * What the technician app shows under the person's name.
 *
 * A mechanic the desk sets up with a mobile number gets a placeholder address,
 * because an account needs one. The app printed whatever `me` sent as the
 * email, so the More screen read "tech-17db5cb0-…@technician.torqvoice.invalid".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = { user: null as Record<string, unknown> | null }

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(async () => state.user) },
    organization: { findUnique: vi.fn(async () => ({ id: 'org-1', name: 'Riverside Auto' })) },
    technician: { findMany: vi.fn(async () => [{ id: 'tech-1', name: 'Sam Ortiz', color: null }]) },
  },
}))
vi.mock('@/features/time-tracking/Lib/timeEntries', () => ({
  getOpenEntry: vi.fn(async () => null),
  loggedMinutes: vi.fn(async () => 0),
}))
vi.mock('@/lib/with-api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/with-api-auth')>('@/lib/with-api-auth')
  return {
    ...actual,
    withApiAuth: vi.fn(async (_request: Request, handler: (ctx: unknown) => Promise<Response>) =>
      handler({
        userId: 'user-1',
        organizationId: 'org-1',
        technicianIds: ['tech-1'],
        isAdmin: false,
      })
    ),
  }
})

import { GET } from '@/app/api/v1/tech/me/route'

async function me() {
  const res = await GET(new Request('https://app.test/api/v1/tech/me'))
  const body = await res.json()
  return (body.data ?? body).user
}

beforeEach(() => {
  state.user = null
})

describe('the signed-in technician', () => {
  it('shows the mobile number of someone set up without an email', async () => {
    state.user = {
      id: 'user-1',
      name: 'Sam Ortiz',
      email: 'tech-17db5cb0-dfe8-4a26-a153-891d3dc0a1b2@technician.torqvoice.invalid',
      phone: '+15125550177',
      image: null,
    }
    const user = await me()
    expect(user.contact).toBe('+15125550177')
    expect(user.email).toBeNull()
    expect(JSON.stringify(user)).not.toContain('torqvoice.invalid')
  })

  it('shows the email of someone who has one', async () => {
    state.user = {
      id: 'user-1',
      name: 'Marco Diaz',
      email: 'marco@riversideauto.example',
      phone: '+15125550188',
      image: null,
    }
    const user = await me()
    expect(user.contact).toBe('marco@riversideauto.example')
    expect(user.email).toBe('marco@riversideauto.example')
  })
})
