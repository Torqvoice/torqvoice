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

    /**
     * A vehicle and one of its own jobs, from one row.
     *
     * Two queries answered this before, and on a database the suite had been
     * run against they happened to agree. On a fresh seed they did not, and
     * the job of one vehicle opened under the id of another draws a page with
     * nothing on it.
     *
     * The organisation comes off the vehicle: `service_records.organizationId`
     * is nullable and the seed leaves it null, scoping a job by the vehicle it
     * sits on.
     */
    const pair = await db.query<{
      vehicleId: string
      serviceRecordId: string
      licensePlate: string
    }>(
      `select v.id as "vehicleId", s.id as "serviceRecordId", v."licensePlate"
         from service_records s
         join vehicles v on v.id = s."vehicleId"
        where coalesce(s."organizationId", v."organizationId") = $1
          and v."licensePlate" is not null and v."licensePlate" <> ''
        order by s."createdAt"
        limit 1`,
      [organizationId]
    )
    const job = pair.rows[0]
    if (!job) throw new Error('the seeded workshop has no work order on a plated vehicle')

    return {
      organizationId,
      vehicleId: job.vehicleId,
      serviceRecordId: job.serviceRecordId,
      vehiclePlate: job.licensePlate,
      customerId: await one(`select id from customers where "organizationId" = $1 limit 1`),
      quoteId: await one(
        `select id from quotes
          where "organizationId" = $1 and "quoteNumber" is not null and "quoteNumber" <> ''
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
      `select s.id
         from service_records s
         join vehicles v on v.id = s."vehicleId"
        where coalesce(s."organizationId", v."organizationId") = $1
        order by s."createdAt"
        limit 1`,
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

/**
 * The newest file on a work order, as the app stored its address.
 *
 * A spec that needs a file belonging to one workshop uploads one and reads it
 * back here. Looking for a seeded one instead only worked on a database the
 * attachment spec had already run against.
 */
export async function latestAttachmentUrl(serviceRecordId: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ fileUrl: string }>(
      `select "fileUrl" from service_attachments
        where "serviceRecordId" = $1 and "fileUrl" like '/api/protected/files/%'
        order by "createdAt" desc
        limit 1`,
      [serviceRecordId]
    )
    const url = result.rows[0]?.fileUrl
    if (!url) throw new Error(`no stored file on work order ${serviceRecordId}`)
    return url
  })
}

/**
 * Backdates a job's scheduled start to an hour ago. A new work order is
 * booked into the shop's next free slot, often tomorrow, and the financial
 * reports run up to the present moment, so a job made by a spec is not in
 * this year's tax report until it is moved into the past.
 */
export async function scheduleServiceRecordInThePast(serviceRecordId: string): Promise<void> {
  await withDb((db) =>
    db.query(
      `update service_records set "startDateTime" = now() - interval '1 hour' where id = $1`,
      [serviceRecordId]
    )
  )
}

/**
 * Email templates a spec made, gone again, and every kind back on its
 * built-in preset.
 *
 * The gallery's own delete is what a workshop uses and one test walks it, but
 * a file that fails halfway must not leave the workshop sending mail designed
 * by a test: the pointer is an `email.template.<kind>` setting, and a
 * template row it names is what the resolver prefers over the preset.
 */
export async function forgetEmailTemplates(namePrefix: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(`delete from email_templates where name like $1`, [`${namePrefix}%`])
    await db.query(
      `delete from app_settings
        where key like 'email.template.%'
          and value not in (select 'design:' || id from email_templates)`
    )
  })
}

/** The names of the templates saved for one kind of mail. */
export async function emailTemplateNames(kind: string): Promise<string[]> {
  return withDb(async (db) => {
    const result = await db.query<{ name: string }>(
      `select name from email_templates where kind = $1 order by "createdAt"`,
      [kind]
    )
    return result.rows.map((row) => row.name)
  })
}

/**
 * Whose car it is, and where to write to them.
 *
 * The customer of the vehicle a spec is working on, not the first customer in
 * the workshop: a message sent from a job goes to the owner of that car, so a
 * spec waiting on another customer's mailbox waits forever.
 */
export async function customerOfVehicle(
  vehicleId: string
): Promise<{ name: string; email: string }> {
  return withDb(async (db) => {
    const result = await db.query<{ name: string; email: string }>(
      `select c.name, c.email
         from vehicles v
         join customers c on c.id = v."customerId"
        where v.id = $1`,
      [vehicleId]
    )
    const customer = result.rows[0]
    if (!customer?.email) throw new Error(`vehicle ${vehicleId} has no customer with an email`)
    return customer
  })
}

/** Where a workshop's connection to a vendor stands: active, pending, error, or none at all. */
export async function connectionStatus(connectorId: string): Promise<string | null> {
  const organizationId = await ownerOrganizationId()
  return withDb(async (db) => {
    const result = await db.query<{ status: string }>(
      `select status from integration_connections
        where "organizationId" = $1 and "connectorId" = $2`,
      [organizationId, connectorId]
    )
    return result.rows[0]?.status ?? null
  })
}

/**
 * Every connection a spec made to a vendor, gone. The payment specs connect
 * Stripe and PayPal to the seeded workshop, and a connection left behind puts
 * pay buttons on every invoice the rest of the suite shares.
 */
export async function forgetConnections(connectorIds: string[]): Promise<void> {
  const organizationId = await ownerOrganizationId()
  await withDb((db) =>
    db.query(
      `delete from integration_connections
        where "organizationId" = $1 and "connectorId" = any($2::text[])`,
      [organizationId, connectorIds]
    )
  )
}

export interface RecordedPayment {
  amount: number
  provider: string | null
  method: string
  externalId: string | null
}

/** The money recorded against one work order, oldest first. */
export async function paymentsFor(serviceRecordId: string): Promise<RecordedPayment[]> {
  return withDb(async (db) => {
    const result = await db.query<RecordedPayment>(
      `select amount, provider, method, "externalId" from payments
        where "serviceRecordId" = $1
        order by "createdAt", id`,
      [serviceRecordId]
    )
    return result.rows.map((row) => ({ ...row, amount: Number(row.amount) }))
  })
}

/**
 * Writes a vendor payment row straight into the table, bypassing the app.
 *
 * For the one question only the database can answer: whether it refuses a
 * second row for a payment it already holds. Returns the Postgres error code
 * when the insert is refused, or null when it went in.
 */
export async function insertVendorPaymentRow(row: {
  serviceRecordId: string
  provider: string
  externalId: string
  amount: number
}): Promise<string | null> {
  return withDb(async (db) => {
    try {
      await db.query(
        `insert into payments (id, amount, method, provider, "externalId", "serviceRecordId", "updatedAt")
         values (md5(random()::text || clock_timestamp()::text), $1, $2, $2, $3, $4, now())`,
        [row.amount, row.provider, row.externalId, row.serviceRecordId]
      )
      return null
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown'
    }
  })
}

/**
 * How many rows one invoice holds for one vendor payment.
 *
 * Counted against the invoice as well as the id: a vendor's id means one
 * payment on one invoice, and a count across the whole table also finds any
 * other invoice that happens to carry the same id, which is not a duplicate.
 */
export async function vendorPaymentRows(
  serviceRecordId: string,
  externalId: string
): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ n: number }>(
      `select count(*)::int as n from payments
        where "serviceRecordId" = $1 and "externalId" = $2`,
      [serviceRecordId, externalId]
    )
    return result.rows[0]?.n ?? 0
  })
}

/** Removes the rows a spec wrote for one vendor payment. */
export async function deleteVendorPaymentRows(externalId: string): Promise<void> {
  await withDb((db) => db.query(`delete from payments where "externalId" = $1`, [externalId]))
}

/** The id of the user signed up with an address. */
export async function userIdFor(email: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `select id from users where lower(email) = lower($1)`,
      [email]
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error(`no user with ${email}`)
    return id
  })
}

/**
 * Writes customers straight into a workshop, as if it had typed them in.
 *
 * For reaching a plan limit without twenty trips through a form: what is
 * under test is the one customer past the limit, and that one goes through
 * the app. These are real customers, not sample ones, so they count.
 */
export async function insertCustomers(
  organizationId: string,
  userId: string,
  count: number,
  prefix: string
): Promise<void> {
  await withDb((db) =>
    db.query(
      `insert into customers (id, name, "userId", "organizationId", "updatedAt")
       select md5(random()::text || clock_timestamp()::text || n), $3 || ' ' || n, $2, $1, now()
       from generate_series(1, $4::int) as n`,
      [organizationId, userId, prefix, count]
    )
  )
}

/** Every customer row a workshop holds, sample ones included. */
export async function customerRows(organizationId: string): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ n: number }>(
      `select count(*)::int as n from customers where "organizationId" = $1`,
      [organizationId]
    )
    return result.rows[0]?.n ?? 0
  })
}

/** Team invitations a workshop has sent. */
export async function teamInvitations(organizationId: string): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ n: number }>(
      `select count(*)::int as n from team_invitations where "organizationId" = $1`,
      [organizationId]
    )
    return result.rows[0]?.n ?? 0
  })
}

/**
 * Puts a workshop on an active Pro subscription, as a paid checkout would.
 * Returns the plan's id so the spec can take it away again.
 */
export async function giveProPlan(organizationId: string): Promise<string> {
  return withDb(async (db) => {
    const plan = await db.query<{ id: string }>(
      `insert into subscription_plans (id, name, price, "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), 'E2E Pro', 0, now())
       returning id`
    )
    const planId = plan.rows[0].id
    await db.query(
      `insert into subscriptions (id, status, "organizationId", "planId", "currentPeriodEnd", "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), 'active', $1, $2, now() + interval '30 days', now())`,
      [organizationId, planId]
    )
    return planId
  })
}

/** Takes a subscription and its plan away again. */
export async function removePlan(organizationId: string, planId: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(`delete from subscriptions where "organizationId" = $1`, [organizationId])
    await db.query(`delete from subscription_plans where id = $1`, [planId])
  })
}

export interface PersonRecord {
  /** How many users hold the address: more than one is two people where there should be one. */
  users: number
  /** How each of them can sign in: `credential` for a password, `google`. */
  providers: string[]
  emailVerified: boolean
}

/** Who holds an address, and how they can sign in. */
export async function personWithEmail(email: string): Promise<PersonRecord> {
  return withDb(async (db) => {
    const users = await db.query<{ id: string; emailVerified: boolean }>(
      `select id, "emailVerified" from users where lower(email) = lower($1)`,
      [email]
    )
    const providers = await db.query<{ providerId: string }>(
      `select a."providerId" from accounts a join users u on u.id = a."userId"
        where lower(u.email) = lower($1) order by a."providerId"`,
      [email]
    )
    return {
      users: users.rows.length,
      providers: providers.rows.map((row) => row.providerId),
      emailVerified: users.rows.some((row) => row.emailVerified),
    }
  })
}

/** Every vehicle row a workshop holds. */
export async function vehicleRows(organizationId: string): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ n: number }>(
      `select count(*)::int as n from vehicles where "organizationId" = $1`,
      [organizationId]
    )
    return result.rows[0]?.n ?? 0
  })
}

/** One of a workshop's settings as stored, or null when it was never saved. */
export async function workshopSetting(organizationId: string, key: string): Promise<string | null> {
  return withDb(async (db) => {
    const result = await db.query<{ value: string }>(
      `select value from app_settings where "organizationId" = $1 and key = $2`,
      [organizationId, key]
    )
    return result.rows[0]?.value ?? null
  })
}

/**
 * A vehicle registry connected to a workshop, active, the way the header's
 * plate lookup looks for one. No keys: nothing is looked up, only offered.
 */
export async function connectRegistry(
  organizationId: string,
  userId: string,
  connectorId: string
): Promise<void> {
  await withDb((db) =>
    db.query(
      `insert into integration_connections
         (id, "organizationId", "connectorId", status, "createdById", "updatedAt")
       values ($1, $2, $3, 'active', $4, now())`,
      [`e2e-${connectorId}-${Date.now()}`, organizationId, connectorId, userId]
    )
  )
}

export async function disconnectRegistry(
  organizationId: string,
  connectorId: string
): Promise<void> {
  await withDb((db) =>
    db.query(
      `delete from integration_connections where "organizationId" = $1 and "connectorId" = $2`,
      [organizationId, connectorId]
    )
  )
}

/** The id of a workshop's customer with exactly this name. */
export async function customerIdNamed(organizationId: string, name: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `select id from customers where "organizationId" = $1 and name = $2`,
      [organizationId, name]
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error(`no customer named ${name}`)
    return id
  })
}

// ─── The security specs ──────────────────────────────────────────────────────

/**
 * A custom role carrying every action on every subject the app knows, and no
 * admin standing. It is the sharpest test of "logged in is not allowed": a
 * member with this role passes every `requiredPermissions` check there is,
 * and the owner-only and admin-only actions have to refuse them anyway.
 */
export async function createRoleWithEveryPermission(
  organizationId: string,
  name: string
): Promise<string> {
  const subjects = [
    'dashboard',
    'vehicles',
    'customers',
    'work_orders',
    'quotes',
    'services',
    'billing',
    'inventory',
    'labor_presets',
    'inspections',
    'tire_hotel',
    'reports',
    'settings',
    'work_board',
    'ai_assistant',
    'time_tracking',
  ]
  const actions = ['create', 'read', 'update', 'delete', 'manage']
  return withDb(async (db) => {
    const role = await db.query<{ id: string }>(
      `insert into roles (id, name, "isAdmin", "organizationId", "createdAt", "updatedAt")
       values (gen_random_uuid()::text, $1, false, $2, now(), now())
       returning id`,
      [name, organizationId]
    )
    const roleId = role.rows[0].id
    for (const subject of subjects) {
      for (const action of actions) {
        await db.query(
          `insert into permissions (id, action, subject, "roleId")
           values (gen_random_uuid()::text, $1, $2, $3)`,
          [action, subject, roleId]
        )
      }
    }
    return roleId
  })
}

/** Gives a member a custom role, and a built-in standing (member or admin) beside it. */
export async function setMembership(
  email: string,
  organizationId: string,
  membership: { roleId: string | null; role: 'member' | 'admin' }
): Promise<void> {
  await withDb((db) =>
    db.query(
      `update organization_members m
          set "roleId" = $3, role = $4
         from users u
        where u.id = m."userId" and u.email = $1 and m."organizationId" = $2`,
      [email, organizationId, membership.roleId, membership.role]
    )
  )
}

/** The credential in a pending invitation, or null when there is none for the address. */
export async function invitationTokenFor(
  email: string,
  organizationId: string
): Promise<string | null> {
  return withDb(async (db) => {
    const result = await db.query<{ token: string }>(
      `select token from team_invitations
        where email = $1 and "organizationId" = $2 and status = 'pending'`,
      [email, organizationId]
    )
    return result.rows[0]?.token ?? null
  })
}

/** How much of the workshop there is, for a test that must find it all still there. */
export async function contentCounts(organizationId: string): Promise<Record<string, number>> {
  return withDb(async (db) => {
    const counts: Record<string, number> = {}
    for (const table of ['vehicles', 'customers', 'quotes', 'inventory_parts', 'notifications']) {
      const result = await db.query<{ n: string }>(
        `select count(*)::text as n from ${table} where "organizationId" = $1`,
        [organizationId]
      )
      counts[table] = Number(result.rows[0].n)
    }
    return counts
  })
}

/**
 * A file row written straight to the job, bypassing the schema that guards
 * the action: what a record carried before the guard existed, or what a
 * restore could bring in. The path resolver is the last line for these.
 */
export async function insertServiceAttachment(row: {
  serviceRecordId: string
  fileName: string
  fileUrl: string
  fileType: string
}): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `insert into service_attachments
         (id, "fileName", "fileUrl", "fileType", "fileSize", category, "includeInInvoice", "serviceRecordId")
       values (gen_random_uuid()::text, $1, $2, $3, 1, 'image', true, $4)
       returning id`,
      [row.fileName, row.fileUrl, row.fileType, row.serviceRecordId]
    )
    return result.rows[0].id
  })
}

export async function deleteServiceAttachments(ids: string[]): Promise<void> {
  await withDb((db) =>
    db.query(`delete from service_attachments where id = any($1::text[])`, [ids])
  )
}

/** How many file rows carry a name, on any job. */
export async function serviceAttachmentsNamed(fileName: string): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ n: string }>(
      `select count(*)::text as n from service_attachments where "fileName" = $1`,
      [fileName]
    )
    return Number(result.rows[0].n)
  })
}

/** A live connection to a vendor, planted with sealed keys; see `support/webhooks.ts`. */
export async function insertConnection(row: {
  organizationId: string
  connectorId: string
  credentials: string
  settings: Record<string, unknown>
  createdById: string
}): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `insert into integration_connections
         (id, "organizationId", "connectorId", status, credentials, settings, "createdById", "createdAt", "updatedAt")
       values (gen_random_uuid()::text, $1, $2, 'active', $3, $4::jsonb, $5, now(), now())
       returning id`,
      [
        row.organizationId,
        row.connectorId,
        row.credentials,
        JSON.stringify(row.settings),
        row.createdById,
      ]
    )
    return result.rows[0].id
  })
}

/** Inbound text messages with exactly this body, for a workshop. */
export async function inboundSmsCount(organizationId: string, body: string): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ n: string }>(
      `select count(*)::text as n from sms_messages
        where "organizationId" = $1 and direction = 'inbound' and body = $2`,
      [organizationId, body]
    )
    return Number(result.rows[0].n)
  })
}

export async function deleteInboundSms(organizationId: string, body: string): Promise<void> {
  await withDb((db) =>
    db.query(
      `delete from sms_messages where "organizationId" = $1 and direction = 'inbound' and body = $2`,
      [organizationId, body]
    )
  )
}

// ─── Work order titles ───────────────────────────────────────────────────────

/** What a job is called and numbered, straight from its row. */
export async function serviceRecordNames(
  serviceRecordId: string
): Promise<{ title: string; invoiceNumber: string | null }> {
  return withDb(async (db) => {
    const result = await db.query<{ title: string; invoiceNumber: string | null }>(
      `select title, "invoiceNumber" from service_records where id = $1`,
      [serviceRecordId]
    )
    const row = result.rows[0]
    if (!row) throw new Error(`no work order ${serviceRecordId}`)
    return row
  })
}

/** The words a title template can print about one vehicle and its owner. */
export async function vehicleFacts(vehicleId: string): Promise<{
  licensePlate: string | null
  make: string
  model: string
  year: number
  vin: string | null
  customerName: string | null
}> {
  return withDb(async (db) => {
    const result = await db.query<{
      licensePlate: string | null
      make: string
      model: string
      year: number
      vin: string | null
      customerName: string | null
    }>(
      `select v."licensePlate", v.make, v.model, v.year, v.vin, c.name as "customerName"
         from vehicles v
         left join customers c on c.id = v."customerId"
        where v.id = $1`,
      [vehicleId]
    )
    const row = result.rows[0]
    if (!row) throw new Error(`no vehicle ${vehicleId}`)
    return row
  })
}

/** Removes a workshop setting so the app falls back to its default for it. */
export async function forgetWorkshopSetting(organizationId: string, key: string): Promise<void> {
  await withDb((db) =>
    db.query(`delete from app_settings where "organizationId" = $1 and key = $2`, [
      organizationId,
      key,
    ])
  )
}

/** Marks the address verified, as clicking the mail's link would. */
export async function markEmailVerified(email: string): Promise<void> {
  await withDb((db) =>
    db.query(`update users set "emailVerified" = true where lower(email) = lower($1)`, [email])
  )
}

export interface MembershipRecord {
  id: string
  role: string
  roleId: string | null
}

/** A person's membership of a workshop, as stored. */
export async function membershipOf(
  email: string,
  organizationId: string
): Promise<MembershipRecord> {
  return withDb(async (db) => {
    const result = await db.query<MembershipRecord>(
      `select m.id, m.role, m."roleId" from organization_members m
         join users u on u.id = m."userId"
        where lower(u.email) = lower($1) and m."organizationId" = $2`,
      [email, organizationId]
    )
    if (!result.rows[0]) throw new Error(`${email} is not a member of ${organizationId}`)
    return result.rows[0]
  })
}

/** A role that carries the admin switch and nothing else. */
export async function createAdminRole(organizationId: string, name: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `insert into roles (id, name, "isAdmin", "organizationId", "createdAt", "updatedAt")
       values (gen_random_uuid()::text, $1, true, $2, now(), now()) returning id`,
      [name, organizationId]
    )
    return result.rows[0].id
  })
}

export async function deleteRoles(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await withDb((db) => db.query(`delete from roles where id = any($1::text[])`, [ids]))
}

/** A technician on a workshop's board, made here so the spec owns it. */
export async function insertTechnician(organizationId: string, name: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `insert into technicians (id, name, "organizationId", "createdAt", "updatedAt")
       values (gen_random_uuid()::text, $1, $2, now(), now()) returning id`,
      [name, organizationId]
    )
    return result.rows[0].id
  })
}

export async function insertWorkBay(organizationId: string, name: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `insert into work_bays (id, name, "organizationId", "createdAt", "updatedAt")
       values (gen_random_uuid()::text, $1, $2, now(), now()) returning id`,
      [name, organizationId]
    )
    return result.rows[0].id
  })
}

export async function deleteTechnicians(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await withDb((db) => db.query(`delete from technicians where id = any($1::text[])`, [ids]))
}

export async function deleteWorkBays(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await withDb((db) => db.query(`delete from work_bays where id = any($1::text[])`, [ids]))
}

export interface JobAssignment {
  id: string
  technicianId: string | null
  workBayId: string | null
}

/** A job's technician and bay as stored, by its id. */
export async function jobAssignment(serviceRecordId: string): Promise<JobAssignment> {
  return withDb(async (db) => {
    const result = await db.query<JobAssignment>(
      `select id, "technicianId", "workBayId" from service_records where id = $1`,
      [serviceRecordId]
    )
    if (!result.rows[0]) throw new Error(`no job ${serviceRecordId}`)
    return result.rows[0]
  })
}

/** How many jobs a vehicle has, before and after an attempt to add one. */
export async function jobCount(vehicleId: string): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ n: string }>(
      `select count(*)::text as n from service_records where "vehicleId" = $1`,
      [vehicleId]
    )
    return Number(result.rows[0].n)
  })
}

/** Inbound WhatsApp messages with exactly this body, for a workshop. */
export async function inboundWhatsappCount(organizationId: string, body: string): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ n: string }>(
      `select count(*)::text as n from whatsapp_messages
        where "organizationId" = $1 and direction = 'inbound' and body = $2`,
      [organizationId, body]
    )
    return Number(result.rows[0].n)
  })
}

export async function deleteInboundWhatsapp(organizationId: string, body: string): Promise<void> {
  await withDb((db) =>
    db.query(
      `delete from whatsapp_messages where "organizationId" = $1 and direction = 'inbound' and body like $2`,
      [organizationId, `${body}%`]
    )
  )
}

/** Open sessions a person has, however many browsers and phones that is. */
export async function sessionCountFor(email: string): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ n: string }>(
      `select count(*)::text as n from sessions s join users u on u.id = s."userId"
        where lower(u.email) = lower($1) and s."expiresAt" > now()`,
      [email]
    )
    return Number(result.rows[0].n)
  })
}
