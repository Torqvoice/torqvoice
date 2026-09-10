import { Client } from 'pg'

/**
 * A look into the database the suite seeded, for the few things a browser
 * cannot see. Mail is not one of them any more: what the app posts is read
 * back from the sink in `support/mail.ts`, which is what a person would see.
 * What is left is the secret behind a two-factor QR code.
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

/** The workshop the seeded owner belongs to. */
export async function ownerOrganizationId(email = 'demo@torqvoice.com'): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ organizationId: string }>(
      `select m."organizationId"
         from organization_members m
         join users u on u.id = m."userId"
        where u.email = $1
        limit 1`,
      [email]
    )
    const id = result.rows[0]?.organizationId
    if (!id) throw new Error(`no organization for ${email}`)
    return id
  })
}

/**
 * Everything a save from the invoice designer writes, as it stands now.
 *
 * The designer does not edit one record: it writes the workshop's live
 * layout, its palette and which design is in use, and that changes every
 * invoice printed afterwards — including the ones the pricing and parity
 * specs pin to the cent. Saving also graduates an organization from the
 * classic pre-designer sheet to the designer's, which is not something a
 * test may leave behind it. So the state is taken before and put back after.
 */
export interface InvoiceDesignState {
  organizationId: string
  settings: { key: string; value: string }[]
  designIds: string[]
}

export async function invoiceDesignState(): Promise<InvoiceDesignState> {
  const organizationId = await ownerOrganizationId()
  return withDb(async (db) => {
    const settings = await db.query<{ key: string; value: string }>(
      `select key, value from app_settings where "organizationId" = $1 and key like 'invoice.%'`,
      [organizationId]
    )
    const designs = await db.query<{ id: string }>(
      `select id from document_designs where "organizationId" = $1`,
      [organizationId]
    )
    return {
      organizationId,
      settings: settings.rows,
      designIds: designs.rows.map((row) => row.id),
    }
  })
}

/** Puts the workshop back exactly as `invoiceDesignState` found it. */
export async function restoreInvoiceDesignState(state: InvoiceDesignState): Promise<void> {
  const keys = state.settings.map((row) => row.key)
  await withDb(async (db) => {
    // Anything the designer added goes; anything it changed goes back.
    await db.query(
      `delete from app_settings
        where "organizationId" = $1 and key like 'invoice.%' and not (key = any($2::text[]))`,
      [state.organizationId, keys]
    )
    for (const row of state.settings) {
      await db.query(
        `update app_settings set value = $3 where "organizationId" = $1 and key = $2`,
        [state.organizationId, row.key, row.value]
      )
    }
    await db.query(
      `delete from document_designs
        where "organizationId" = $1 and not (id = any($2::text[]))`,
      [state.organizationId, state.designIds]
    )
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
