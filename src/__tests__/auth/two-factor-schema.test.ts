// @vitest-environment node
/**
 * better-auth's two-factor plugin writes whatever its own schema declares,
 * and Prisma refuses a column it does not know. A field the plugin gained
 * in an upgrade and the model did not is "Failed to enable 2FA" for every
 * user, found in production. This holds the two in step.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { twoFactor } from 'better-auth/plugins/two-factor'

const model = readFileSync('prisma/schema/auth.prisma', 'utf8')
const modelText = model.slice(model.indexOf('model TwoFactor {'))
const body = modelText.slice(0, modelText.indexOf('\n}'))

describe('two-factor schema', () => {
  it('has a column for every field the plugin may write', () => {
    // The plugin carries its own schema; the exported instance is the only
    // public way at it.
    const plugin = twoFactor() as unknown as {
      schema: { twoFactor: { fields: Record<string, unknown> } }
    }
    const fields = Object.keys(plugin.schema.twoFactor.fields)
    expect(fields).toEqual(
      expect.arrayContaining(['verified', 'failedVerificationCount', 'lockedUntil'])
    )
    for (const field of fields) {
      expect(body, `TwoFactor model is missing "${field}"`).toMatch(
        new RegExp(`^\\s+${field}\\s`, 'm')
      )
    }
  })

  it('has a migration adding the verification state', () => {
    const migration = readFileSync(
      'prisma/migrations/20260909210000_two_factor_verification_state/migration.sql',
      'utf8'
    )
    for (const column of ['verified', 'failedVerificationCount', 'lockedUntil']) {
      expect(migration).toContain(`"${column}"`)
    }
    // Existing rows belong to people who already verified their app.
    expect(migration).toMatch(/"verified" BOOLEAN NOT NULL DEFAULT true/)
  })
})
