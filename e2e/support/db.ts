import { Client } from 'pg'

/**
 * A look into the database the suite seeded, for the few things a browser
 * cannot see: the token in a reset-password or invitation mail that was
 * never delivered, because the test environment has no mail provider, and
 * the secret behind a two-factor QR code.
 *
 * Plain pg rather than the app's Prisma client: the tests run in Playwright's
 * process, which has no adapter wired up, and one query does not need one.
 */
async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('E2E_DATABASE_URL is not set. See e2e/README.md.')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

/**
 * The newest password-reset token issued to an address, as better-auth stored
 * it: the identifier is "reset-password:<token>" and the value is the user id.
 * The token is what the mailed link carries.
 */
export async function latestResetToken(email: string): Promise<string | null> {
  return withDb(async (db) => {
    const result = await db.query<{ identifier: string }>(
      `select v.identifier
         from verifications v
         join users u on u.id = v.value
        where u.email = $1
          and v.identifier like 'reset-password:%'
        order by v."createdAt" desc
        limit 1`,
      [email]
    )
    const identifier = result.rows[0]?.identifier
    return identifier ? identifier.slice('reset-password:'.length) : null
  })
}

/** The newest team invitation token for an address: what the mailed sign-up link carries. */
export async function latestInvitationToken(email: string): Promise<string | null> {
  return withDb(async (db) => {
    const result = await db.query<{ token: string }>(
      `select token from team_invitations where email = $1 order by "createdAt" desc limit 1`,
      [email]
    )
    return result.rows[0]?.token ?? null
  })
}

/** The stored (encrypted) TOTP secret of a user, or null when 2FA is not set up. */
export async function storedTwoFactorSecret(email: string): Promise<string | null> {
  return withDb(async (db) => {
    const result = await db.query<{ secret: string }>(
      `select tf.secret from two_factor tf join users u on u.id = tf."userId" where u.email = $1`,
      [email]
    )
    return result.rows[0]?.secret ?? null
  })
}
