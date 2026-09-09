import { Client } from 'pg'

/**
 * A look into the database the suite seeded, for the few things a browser
 * cannot see: the token in a reset-password mail that was never delivered,
 * because the test environment has no mail provider.
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
