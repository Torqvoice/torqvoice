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

/** The workshop a signed-up account ended up owning, by the address it used. */
export async function organizationIdFor(email: string): Promise<string> {
  return ownerOrganizationId(email)
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

/**
 * Addresses of the seeded workshop's own records, for the tests that check a
 * different workshop cannot reach them. Read straight from the database
 * because the point is to ask for them as an outsider: going through the app
 * to find them first would need the very access under test.
 */
export interface TenantFixtures {
  organizationId: string
  vehicleId: string
  serviceRecordId: string
  customerId: string
  quoteId: string
  /** A stored file URL, as the app writes them into its own rows. */
  fileUrl: string
  /**
   * Words that belong to this workshop and nobody else. A cross-tenant page
   * can answer 200 and render an empty shell, which is a refusal too, so the
   * test asks whether any of these reached the screen rather than what the
   * status code was.
   */
  vehiclePlate: string
  customerName: string
  quoteNumber: string
}

export async function seededTenantFixtures(): Promise<TenantFixtures> {
  const organizationId = await ownerOrganizationId()
  return withDb(async (db) => {
    const one = async (sql: string): Promise<string> => {
      const result = await db.query<{ id: string }>(sql, [organizationId])
      const id = result.rows[0]?.id
      if (!id) throw new Error(`the seeded workshop has nothing for: ${sql}`)
      return id
    }
    return {
      organizationId,
      vehicleId: await one(
        `select id from vehicles
          where "organizationId" = $1 and "licensePlate" is not null and "licensePlate" <> ''
          limit 1`
      ),
      serviceRecordId: await one(
        `select id from service_records where "organizationId" = $1 order by "createdAt" limit 1`
      ),
      customerId: await one(`select id from customers where "organizationId" = $1 limit 1`),
      quoteId: await one(
        `select id from quotes
          where "organizationId" = $1 and "quoteNumber" is not null and "quoteNumber" <> ''
          limit 1`
      ),
      fileUrl: await one(
        `select a."fileUrl" as id
           from service_attachments a
           join service_records s on s.id = a."serviceRecordId"
          where s."organizationId" = $1
            and a."fileUrl" like '/api/protected/files/%'
          limit 1`
      ),
      vehiclePlate: await one(
        `select "licensePlate" as id from vehicles
          where "organizationId" = $1 and "licensePlate" is not null and "licensePlate" <> ''
          limit 1`
      ),
      customerName: await one(
        `select name as id from customers where "organizationId" = $1 limit 1`
      ),
      quoteNumber: await one(
        `select "quoteNumber" as id from quotes
          where "organizationId" = $1 and "quoteNumber" is not null and "quoteNumber" <> ''
          limit 1`
      ),
    }
  })
}

/**
 * Any work order belonging to a given workshop, for the tests that point one
 * workshop's credential at another's records. A workshop that has just been
 * opened has a few of its own from onboarding, which is what makes a
 * freshly signed-up account a usable target.
 */
export async function foreignServiceRecordId(organizationId: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `select id from service_records where "organizationId" = $1 order by "createdAt" limit 1`,
      [organizationId]
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error(`no work order in organization ${organizationId}`)
    return id
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

export interface StockedPart {
  id: string
  name: string
  /** What the ledger says it has on hand right now. */
  quantity: number
}

/**
 * A seeded inventory part with enough on hand to be consumed by a job, and
 * whose name is distinctive enough to search for in the picker.
 *
 * The part is chosen rather than created, because what is under test is the
 * path a workshop actually walks: pick a stocked part, use it, and watch the
 * count fall.
 */
export async function stockedPart(organizationId: string, atLeast = 10): Promise<StockedPart> {
  return withDb(async (db) => {
    const result = await db.query<StockedPart>(
      `select id, name, quantity
         from inventory_parts
        where "organizationId" = $1 and quantity >= $2
        order by quantity desc, name
        limit 1`,
      [organizationId, atLeast]
    )
    const part = result.rows[0]
    if (!part) throw new Error(`no inventory part with ${atLeast} or more on hand`)
    return { ...part, quantity: Number(part.quantity) }
  })
}

/** What one inventory part has on hand. */
export async function partQuantity(partId: string): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ quantity: number }>(
      `select quantity from inventory_parts where id = $1`,
      [partId]
    )
    if (!result.rows[0]) throw new Error(`no inventory part ${partId}`)
    return Number(result.rows[0].quantity)
  })
}

/** Set a part's quantity outright, to put the seed back as it was found. */
export async function setPartQuantity(partId: string, quantity: number): Promise<void> {
  await withDb((db) =>
    db.query(`update inventory_parts set quantity = $2 where id = $1`, [partId, quantity])
  )
}

export interface StockMovement {
  delta: number
  quantityAfter: number
  reason: string
  serviceRecordId: string | null
}

/**
 * The ledger for one part, oldest first. Every movement is a row: the count on
 * the part is only ever the running total of these, which is why a spec that
 * checks stock checks both.
 */
export async function stockMovements(
  partId: string,
  serviceRecordId?: string
): Promise<StockMovement[]> {
  return withDb(async (db) => {
    const result = await db.query<StockMovement>(
      `select delta, "quantityAfter", reason, "serviceRecordId"
         from stock_movements
        where "inventoryPartId" = $1
          and ($2::text is null or "serviceRecordId" = $2)
        order by "createdAt", id`,
      [partId, serviceRecordId ?? null]
    )
    return result.rows.map((row) => ({
      ...row,
      delta: Number(row.delta),
      quantityAfter: Number(row.quantityAfter),
    }))
  })
}

/** When a reminder is due, as the instant that was stored for it. */
export async function reminderDueDate(title: string): Promise<Date> {
  return withDb(async (db) => {
    const result = await db.query<{ dueDate: Date }>(
      `select "dueDate" from reminders where title = $1 order by "createdAt" desc limit 1`,
      [title]
    )
    const due = result.rows[0]?.dueDate
    if (!due) throw new Error(`no reminder titled "${title}" with a due date`)
    return new Date(due)
  })
}

/** Removes the reminders a spec made, whatever state the page was left in. */
export async function deleteRemindersTitled(title: string): Promise<void> {
  await withDb((db) => db.query(`delete from reminders where title = $1`, [title]))
}
