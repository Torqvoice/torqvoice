/**
 * @vitest-environment node
 *
 * What a Member may read without the Settings permission.
 *
 * A Member was refused `read:settings` on every ordinary page, because every
 * page asked for the workshop's currency through the same call that guards
 * its payment secrets. The page fell back to built-in defaults without saying
 * so, and each refusal wrote an audit row. The fix is a second, narrow read;
 * these tests are what keeps it narrow.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const findMany = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: { appSetting: { findMany } } }))

const seenOptions = vi.hoisted(() => [] as unknown[])
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    action: (ctx: { userId: string; organizationId: string }) => unknown,
    options?: unknown
  ) => {
    seenOptions.push(options)
    return { success: true, data: await action({ userId: 'u-1', organizationId: 'org-1' }) }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { MEMBER_READABLE_SETTINGS } from '@/features/settings/Lib/memberReadableSettings'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([])
  seenOptions.length = 0
})

describe('the list of what a member may read', () => {
  it('holds nothing that looks like a secret', () => {
    const secretish =
      /secret|password|passwd|token|api[_.-]?key|private|webhook|credential|smtp|licen[sc]e/i
    const names = Object.entries(SETTING_KEYS)
      .filter(([, value]) => MEMBER_READABLE_SETTINGS.has(value))
      .flatMap(([name, value]) => [name, value])
    expect(names.filter((name) => secretish.test(name))).toEqual([])
  })

  it('leaves every secret in the table out', () => {
    for (const secret of [
      SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY,
      SETTING_KEYS.PAYMENT_STRIPE_WEBHOOK_SECRET,
      SETTING_KEYS.PAYMENT_VIPPS_CLIENT_SECRET,
      SETTING_KEYS.PAYMENT_PAYPAL_CLIENT_SECRET,
      SETTING_KEYS.LICENSE_TOKEN,
      SETTING_KEYS.AI_API_KEY,
    ]) {
      expect(MEMBER_READABLE_SETTINGS.has(secret)).toBe(false)
    }
  })

  it('covers every key an ordinary page asks for', () => {
    // A page that asks for a key that is not listed gets it back missing and
    // renders a default, which is the bug this replaced. So the pages are
    // read, and what they ask for is checked against the list.
    const asked = new Map<string, string>()
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
          if (entry !== '__tests__' && entry !== 'generated') walk(path)
        } else if (/\.tsx?$/.test(entry)) {
          const source = readFileSync(path, 'utf8')
          for (const call of source.matchAll(/getDisplaySettings\(\s*\[([\s\S]*?)\]\s*\)/g)) {
            for (const key of call[1].matchAll(/SETTING_KEYS\.([A-Z0-9_]+)/g))
              asked.set(key[1], path)
          }
        }
      }
    }
    walk(join(process.cwd(), 'src'))

    expect(asked.size).toBeGreaterThan(10)
    const unlisted = [...asked].filter(
      ([name]) => !MEMBER_READABLE_SETTINGS.has(SETTING_KEYS[name as keyof typeof SETTING_KEYS])
    )
    expect(unlisted).toEqual([])
  })
})

describe('reading them', () => {
  it('needs membership of the workshop and nothing more', async () => {
    await getDisplaySettings([SETTING_KEYS.CURRENCY_CODE])
    expect(seenOptions).toEqual([undefined])
  })

  it("returns the workshop's own values, read for this workshop only", async () => {
    findMany.mockResolvedValue([{ key: SETTING_KEYS.CURRENCY_CODE, value: 'NOK' }])

    const result = await getDisplaySettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM])

    expect(result).toEqual({ success: true, data: { [SETTING_KEYS.CURRENCY_CODE]: 'NOK' } })
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        key: { in: [SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM] },
      },
      select: { key: true, value: true },
    })
  })

  it('never asks the database for a key that is not on the list', async () => {
    await getDisplaySettings([
      SETTING_KEYS.CURRENCY_CODE,
      SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY,
      SETTING_KEYS.AI_API_KEY,
    ])

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls[0][0].where.key.in).toEqual([SETTING_KEYS.CURRENCY_CODE])
  })

  it('reads nothing at all when every key asked for is private', async () => {
    const result = await getDisplaySettings([SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY])
    expect(result).toEqual({ success: true, data: {} })
    expect(findMany).not.toHaveBeenCalled()
  })
})
