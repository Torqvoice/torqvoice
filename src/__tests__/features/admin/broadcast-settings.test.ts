/**
 * Posting the platform-wide notice.
 *
 * The timestamp is the load-bearing part. Every reader's dismissal is keyed on
 * it, so it decides whether a new notice reaches somebody who dismissed the
 * last one. It is written here, never accepted from the caller, because a
 * client that could set it could silence a live incident for everyone who had
 * already waved the previous one away.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsert = vi.fn((args: unknown) => args)
vi.mock('@/lib/db', () => ({
  db: {
    systemSetting: { upsert: (a: unknown) => upsert(a) },
    $transaction: (ops: unknown[]) => Promise.resolve(ops),
  },
}))
vi.mock('@/lib/with-super-admin', () => ({
  withSuperAdmin: async (fn: () => Promise<unknown>) => {
    try {
      return { success: true, data: await fn() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('@/lib/demo', () => ({
  demoGuard: () => undefined,
}))

const { setSystemSettings } = await import('@/features/admin/Actions/setSystemSettings')

/** The key/value pairs the action actually wrote. */
function written() {
  const out: Record<string, string> = {}
  for (const call of upsert.mock.calls) {
    const args = call[0] as { where: { key: string }; update: { value: string } }
    out[args.where.key] = args.update.value
  }
  return out
}

beforeEach(() => {
  upsert.mockClear()
})

describe('posting a notice', () => {
  it('stamps when it changed, so dismissals reset', async () => {
    await setSystemSettings({ 'broadcast.message': 'Server trouble' })
    const at = written()['broadcast.updatedAt']
    expect(at).toBeTruthy()
    expect(Number.isNaN(Date.parse(at))).toBe(false)
  })

  it('ignores a timestamp the caller supplies', async () => {
    // Forging an old one would hide a live incident from everybody who had
    // dismissed the previous notice.
    await setSystemSettings({
      'broadcast.message': 'Server trouble',
      'broadcast.updatedAt': '1999-01-01T00:00:00.000Z',
    })
    expect(written()['broadcast.updatedAt']).not.toBe('1999-01-01T00:00:00.000Z')
  })

  it('trims and caps the message', async () => {
    await setSystemSettings({ 'broadcast.message': `  ${'x'.repeat(900)}  ` })
    expect(written()['broadcast.message'].length).toBe(400)
  })

  it('falls back to info for a level it cannot style', async () => {
    await setSystemSettings({ 'broadcast.message': 'Hi', 'broadcast.level': 'apocalyptic' })
    expect(written()['broadcast.level']).toBe('info')
  })

  it('keeps a level it can style', async () => {
    await setSystemSettings({ 'broadcast.message': 'Hi', 'broadcast.level': 'warning' })
    expect(written()['broadcast.level']).toBe('warning')
  })

  it('stamps on clearing too, so the banner goes away for everyone', async () => {
    await setSystemSettings({ 'broadcast.message': '' })
    expect(written()['broadcast.message']).toBe('')
    expect(written()['broadcast.updatedAt']).toBeTruthy()
  })

  it('leaves other settings alone', async () => {
    // Saving mail config must not stamp a notice nobody touched.
    await setSystemSettings({ 'smtp.host': 'mail.example.com' })
    expect(written()).toEqual({ 'smtp.host': 'mail.example.com' })
  })

  it('refuses a key it does not know', async () => {
    await setSystemSettings({ 'something.invented': 'x' })
    expect(written()).toEqual({})
  })
})
