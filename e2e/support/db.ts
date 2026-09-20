import { randomBytes, scryptSync } from 'node:crypto'
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

/** A customer and a quote, each taken whole so its id and its words agree. */
async function pairs(
  db: Client,
  organizationId: string
): Promise<Pick<TenantFixtures, 'customerId' | 'customerName' | 'quoteId' | 'quoteNumber'>> {
  const customer = await db.query<{ id: string; name: string }>(
    `select id, name from customers where "organizationId" = $1 order by "createdAt", id limit 1`,
    [organizationId]
  )
  if (!customer.rows[0]) throw new Error('the seeded workshop has no customer')

  const quote = await db.query<{ id: string; quoteNumber: string }>(
    `select id, "quoteNumber" from quotes
      where "organizationId" = $1 and "quoteNumber" is not null and "quoteNumber" <> ''
      order by "createdAt", id limit 1`,
    [organizationId]
  )
  if (!quote.rows[0]) throw new Error('the seeded workshop has no numbered quote')

  return {
    customerId: customer.rows[0].id,
    customerName: customer.rows[0].name,
    quoteId: quote.rows[0].id,
    quoteNumber: quote.rows[0].quoteNumber,
  }
}

export async function seededTenantFixtures(): Promise<TenantFixtures> {
  const organizationId = await ownerOrganizationId()
  return withDb(async (db) => {
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
      // Id and words from one row each, for the same reason the vehicle and
      // its job come from one row: `limit 1` without an order is not a
      // promise, and two queries for "a customer" can answer with two
      // different customers. That way round the id opens one record and the
      // name that is searched for on it belongs to another.
      ...(await pairs(db, organizationId)),
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
export async function giveProPlan(
  organizationId: string,
  stripe?: { subscriptionId: string; customerId: string }
): Promise<string> {
  return withDb(async (db) => {
    const plan = await db.query<{ id: string }>(
      `insert into subscription_plans (id, name, price, "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), 'E2E Pro', 0, now())
       returning id`
    )
    const planId = plan.rows[0].id
    // With Stripe ids the row looks like a real purchase, which is what the
    // manage-subscription card and its buttons are shown for.
    await db.query(
      `insert into subscriptions (id, status, "organizationId", "planId", "currentPeriodEnd", "updatedAt",
                                  "stripeSubscriptionId", "stripeCustomerId")
       values (md5(random()::text || clock_timestamp()::text), 'active', $1, $2, now() + interval '30 days', now(), $3, $4)`,
      [organizationId, planId, stripe?.subscriptionId ?? null, stripe?.customerId ?? null]
    )
    return planId
  })
}

/** Flags a subscription as ending at the period end, as a cancel through torqvoice.com would. */
export async function setCancelAtPeriodEnd(organizationId: string, value: boolean): Promise<void> {
  await withDb((db) =>
    db.query(`update subscriptions set "cancelAtPeriodEnd" = $2 where "organizationId" = $1`, [
      organizationId,
      value,
    ])
  )
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

/** Device rows a person has whose user agent mentions `needle`. */
export async function deviceCountFor(email: string, needle: string): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ n: string }>(
      `select count(*)::text as n from user_devices d join users u on u.id = d."userId"
        where lower(u.email) = lower($1) and d."userAgent" like $2`,
      [email, `%${needle}%`]
    )
    return Number(result.rows[0].n)
  })
}

/**
 * Matches better-auth's scrypt parameters, the same way the seed does, so a
 * password written here is accepted by the sign-in form.
 */
function hashPassword(password: string): string {
  const N = 16384
  const r = 16
  const p = 1
  const salt = randomBytes(16).toString('hex')
  const key = scryptSync(password.normalize('NFKC'), salt, 64, { N, r, p, maxmem: 128 * N * r * 2 })
  return `${salt}:${key.toString('hex')}`
}

export interface PlantedWorkshop {
  userId: string
  organizationId: string
}

/**
 * A second tenant, put straight into the database.
 *
 * A self-hosted install opens one workshop; every later sign-up is told to
 * ask for an invitation. A spec that needs a second, separate workshop to
 * prove isolation therefore cannot sign one up and has to plant it: a
 * verified person with a password, and a workshop they own.
 */
export async function plantWorkshop(input: {
  name: string
  email: string
  password: string
  workshopName: string
}): Promise<PlantedWorkshop> {
  return withDb(async (db) => {
    const user = await db.query<{ id: string }>(
      `insert into users (id, name, email, "emailVerified", "termsAcceptedAt", "createdAt", "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), $1, $2, true, now(), now(), now())
       returning id`,
      [input.name, input.email.toLowerCase()]
    )
    const userId = user.rows[0].id
    await db.query(
      `insert into accounts (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), $1, 'credential', $1, $2, now(), now())`,
      [userId, hashPassword(input.password)]
    )
    const org = await db.query<{ id: string }>(
      `insert into organizations (id, name, "createdAt", "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), $1, now(), now())
       returning id`,
      [input.workshopName]
    )
    const organizationId = org.rows[0].id
    await db.query(
      `insert into organization_members (id, role, "userId", "organizationId")
       values (md5(random()::text || clock_timestamp()::text), 'owner', $1, $2)`,
      [userId, organizationId]
    )
    return { userId, organizationId }
  })
}

/** Removes a person and, through the cascade, their memberships and sessions. */
export async function deletePersonWithEmail(email: string): Promise<void> {
  await withDb((db) => db.query(`delete from users where lower(email) = lower($1)`, [email]))
}

/** How many workshops the install has. */
export async function organizationCount(): Promise<number> {
  return withDb(async (db) => {
    const result = await db.query<{ count: string }>(
      `select count(*)::text as count from organizations`
    )
    return Number(result.rows[0].count)
  })
}

/**
 * One customer, one vehicle and one work order in a workshop, for a spec
 * that needs a job to point at. A planted workshop has none of the sample
 * data onboarding would have given it.
 */
export async function plantJob(
  organizationId: string,
  userId: string,
  title: string
): Promise<{ serviceRecordId: string; vehicleId: string }> {
  return withDb(async (db) => {
    const customer = await db.query<{ id: string }>(
      `insert into customers (id, name, "userId", "organizationId", "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), $1, $2, $3, now())
       returning id`,
      [`${title} customer`, userId, organizationId]
    )
    const vehicle = await db.query<{ id: string }>(
      `insert into vehicles (id, make, model, year, "userId", "organizationId", "customerId", "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), 'E2E', $1, 2020, $2, $3, $4, now())
       returning id`,
      [title, userId, organizationId, customer.rows[0].id]
    )
    const vehicleId = vehicle.rows[0].id
    const job = await db.query<{ id: string }>(
      `insert into service_records (id, title, "vehicleId", "organizationId", "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), $1, $2, $3, now())
       returning id`,
      [title, vehicleId, organizationId]
    )
    return { serviceRecordId: job.rows[0].id, vehicleId }
  })
}

// ─── Notifications ───────────────────────────────────────────────────────────

export interface PlantedNotification {
  type: string
  title: string
  message: string
  entityType: string
  entityId: string
  entityUrl: string
}

/**
 * A notification written straight into the bell, with the address the code
 * that raises it builds. Planting it rather than provoking it lets a spec
 * follow links whose trigger needs a provider the harness cannot play (an
 * inbound SMS, a Telegram webhook), and also links already stored in the old
 * shape, which the pages still have to honour.
 */
export async function plantNotification(
  organizationId: string,
  n: PlantedNotification
): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `insert into notifications (id, type, title, message, "entityType", "entityId", "entityUrl", read, "organizationId", "createdAt")
       values (md5(random()::text || clock_timestamp()::text), $1, $2, $3, $4, $5, $6, false, $7, now())
       returning id`,
      [n.type, n.title, n.message, n.entityType, n.entityId, n.entityUrl, organizationId]
    )
    return result.rows[0].id
  })
}

export async function deleteNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await withDb((db) => db.query('delete from notifications where id = any($1)', [ids]))
}

/** An inbound message on a customer's thread, as the webhook would have stored it. */
export async function plantInboundMessage(
  channel: 'sms' | 'telegram',
  organizationId: string,
  customerId: string,
  body: string
): Promise<void> {
  await withDb((db) =>
    channel === 'sms'
      ? db.query(
          `insert into sms_messages (id, direction, "fromNumber", "toNumber", body, status, "organizationId", "customerId", "createdAt", "updatedAt")
           values (md5(random()::text || clock_timestamp()::text), 'inbound', '+4790000000', '+4790000001', $1, 'received', $2, $3, now(), now())`,
          [body, organizationId, customerId]
        )
      : db.query(
          `insert into telegram_messages (id, direction, "chatId", body, status, "organizationId", "customerId", "createdAt", "updatedAt")
           values (md5(random()::text || clock_timestamp()::text), 'inbound', '777000', $1, 'received', $2, $3, now(), now())`,
          [body, organizationId, customerId]
        )
  )
}

/**
 * Links a customer to a Telegram chat and hands back what was there before.
 * A real inbound Telegram message only ever comes from a linked chat, and the
 * conversation shows nothing but "not connected yet" without one.
 */
export async function linkTelegramChat(
  customerId: string,
  chatId: string | null
): Promise<string | null> {
  return withDb(async (db) => {
    const before = await db.query<{ telegramChatId: string | null }>(
      'select "telegramChatId" from customers where id = $1',
      [customerId]
    )
    await db.query('update customers set "telegramChatId" = $1 where id = $2', [chatId, customerId])
    return before.rows[0]?.telegramChatId ?? null
  })
}

export async function deleteMessagesWithBody(body: string): Promise<void> {
  await withDb(async (db) => {
    await db.query('delete from sms_messages where body = $1', [body])
    await db.query('delete from telegram_messages where body = $1', [body])
  })
}

/** A vehicle job with the customer it belongs to, taken from one row so the ids agree. */
export async function jobWithCustomer(organizationId: string): Promise<{
  vehicleId: string
  serviceRecordId: string
  customerId: string
  customerName: string
}> {
  return withDb(async (db) => {
    const result = await db.query<{
      vehicleId: string
      serviceRecordId: string
      customerId: string
      customerName: string
    }>(
      `select v.id as "vehicleId", s.id as "serviceRecordId", c.id as "customerId", c.name as "customerName"
         from service_records s
         join vehicles v on v.id = s."vehicleId"
         join customers c on c.id = v."customerId"
        where s."organizationId" = $1
        order by s."createdAt" asc
        limit 1`,
      [organizationId]
    )
    const row = result.rows[0]
    if (!row) throw new Error('the seeded workshop has no vehicle job with a customer')
    return row
  })
}

export interface PlantedVehicleFiles {
  vehicleImage: string
  jobPhoto: string
  /** A tire set's photo, also on the job as a tire hotel copy. */
  tireSetPhoto: string
  statusVideo: string
  inspectionPhoto?: string
  quoteDocument: string
  /** A URL naming another workshop, as a row restored from its backup can. */
  foreignPhoto: string
}

export interface PlantedVehicle {
  vehicleId: string
  serviceRecordId: string
  tireSetId: string
  quoteId: string
  inspected: boolean
}

/**
 * A vehicle with every kind of file that can go with it, written straight
 * into the database so a spec knows exactly which rows point at which file:
 * its image; a job with a photo, a status report video and the copy of a tire
 * set's photo; an inspection with a photo on one item (when the workshop has
 * a template to hang it on); and, pointing at the same vehicle but not
 * deleted with it, a stored tire set and a quote with a document.
 */
export async function plantVehicleWithFiles(
  organizationId: string,
  userId: string,
  files: PlantedVehicleFiles,
  label: string
): Promise<PlantedVehicle> {
  return withDb(async (db) => {
    const id = () => randomBytes(12).toString('hex')
    const vehicleId = id()
    const serviceRecordId = id()
    const tireSetId = id()
    const quoteId = id()
    await db.query(
      `insert into vehicles (id, make, model, year, "userId", "organizationId", "imageUrl", "updatedAt")
       values ($1, 'E2E', $2, 2020, $3, $4, $5, now())`,
      [vehicleId, label, userId, organizationId, files.vehicleImage]
    )
    await db.query(
      `insert into service_records (id, title, "vehicleId", "organizationId", "updatedAt")
       values ($1, $2, $3, $4, now())`,
      [serviceRecordId, `${label} job`, vehicleId, organizationId]
    )
    await db.query(
      `insert into tire_sets (id, "organizationId", "userId", "vehicleId", "updatedAt")
       values ($1, $2, $3, $4, now())`,
      [tireSetId, organizationId, userId, vehicleId]
    )
    await db.query(
      `insert into tire_set_attachments (id, "organizationId", "tireSetId", "fileName", "fileUrl", "fileType", "fileSize")
       values ($1, $2, $3, 'rim.jpg', $4, 'image/jpeg', 10)`,
      [id(), organizationId, tireSetId, files.tireSetPhoto]
    )
    for (const [fileUrl, category] of [
      [files.jobPhoto, 'image'],
      [files.tireSetPhoto, 'tire_hotel'],
      [files.foreignPhoto, 'image'],
    ]) {
      await db.query(
        `insert into service_attachments (id, "serviceRecordId", "fileName", "fileUrl", "fileType", "fileSize", category)
         values ($1, $2, 'photo.jpg', $3, 'image/jpeg', 10, $4)`,
        [id(), serviceRecordId, fileUrl, category]
      )
    }
    await db.query(
      `insert into status_reports (id, "publicToken", "organizationId", "serviceRecordId", "videoUrl", "updatedAt")
       values ($1, $2, $3, $4, $5, now())`,
      [id(), id(), organizationId, serviceRecordId, files.statusVideo]
    )
    await db.query(
      `insert into quotes (id, title, "userId", "organizationId", "vehicleId", "updatedAt")
       values ($1, $2, $3, $4, $5, now())`,
      [quoteId, `${label} quote`, userId, organizationId, vehicleId]
    )
    await db.query(
      `insert into quote_attachments (id, "quoteId", "fileName", "fileUrl", "fileType", "fileSize")
       values ($1, $2, 'estimate.pdf', $3, 'application/pdf', 10)`,
      [id(), quoteId, files.quoteDocument]
    )

    let inspected = false
    const template = await db.query<{ id: string }>(
      `select id from inspection_templates where "organizationId" = $1 limit 1`,
      [organizationId]
    )
    if (files.inspectionPhoto && template.rows[0]) {
      const inspectionId = id()
      await db.query(
        `insert into inspections (id, "vehicleId", "organizationId", "templateId", "updatedAt")
         values ($1, $2, $3, $4, now())`,
        [inspectionId, vehicleId, organizationId, template.rows[0].id]
      )
      await db.query(
        `insert into inspection_items (id, "inspectionId", name, section, "imageUrls")
         values ($1, $2, 'Brakes', 'Checks', $3)`,
        [id(), inspectionId, [files.inspectionPhoto]]
      )
      inspected = true
    }
    return { vehicleId, serviceRecordId, tireSetId, quoteId, inspected }
  })
}

/** Removes what `plantVehicleWithFiles` made that its spec did not delete. */
export async function removePlantedVehicle(planted: PlantedVehicle): Promise<void> {
  await withDb(async (db) => {
    await db.query('delete from quotes where id = $1', [planted.quoteId])
    await db.query('delete from tire_sets where id = $1', [planted.tireSetId])
    await db.query('delete from inspections where "vehicleId" = $1', [planted.vehicleId])
    await db.query('delete from vehicles where id = $1', [planted.vehicleId])
  })
}

/**
 * Every permission refusal logged for one person since a moment in time.
 *
 * `withAuth` writes an `auth.permissionDenied` row whenever a role is short of
 * what an action asked for, which makes the audit log the one place that says
 * what a page quietly wanted and did not get. A refusal on a page the role is
 * meant to reach is, by definition, a bug: the page renders anyway, falls back
 * to a built-in default, and says nothing about it.
 *
 * The write is fire-and-forget, so give it a moment to land before counting.
 */
export async function permissionDenialsFor(email: string, since: Date): Promise<string[]> {
  return withDb(async (db) => {
    const result = await db.query<{ message: string }>(
      `select coalesce(a.message, a.action) as message
         from audit_logs a
         join users u on u.id = a."userId"
        where lower(u.email) = lower($1)
          and a.action = 'auth.permissionDenied'
          and a.timestamp >= $2
        order by a.timestamp`,
      [email, since]
    )
    return result.rows.map((row) => row.message)
  })
}

/**
 * Sets one of a workshop's settings directly, returning what was there before
 * (null when the key had never been saved), so a spec can put it back.
 *
 * The row needs an owner: `app_settings.userId` is not nullable, so a key the
 * workshop has never saved is attributed to whoever owns the workshop.
 */
export async function setWorkshopSetting(
  organizationId: string,
  key: string,
  value: string
): Promise<string | null> {
  return withDb(async (db) => {
    const before = await db.query<{ value: string }>(
      `select value from app_settings where "organizationId" = $1 and key = $2`,
      [organizationId, key]
    )
    await db.query(
      `insert into app_settings (id, key, value, "userId", "organizationId")
       values (gen_random_uuid()::text, $2, $3,
               (select "userId" from organization_members
                 where "organizationId" = $1 and role = 'owner' limit 1),
               $1)
       on conflict ("organizationId", key) do update set value = excluded.value`,
      [organizationId, key, value]
    )
    return before.rows[0]?.value ?? null
  })
}

/**
 * A custom field on one kind of record, made here so the spec owns it.
 *
 * `name` is the key the app stores values under and `label` is what a person
 * reads, so both are stamped: the point of the field is that its label shows
 * up on the record, and a name left over from an earlier run would collide on
 * `(organizationId, name, entityType)`.
 */
export async function plantCustomField(
  organizationId: string,
  entityType: 'service_record' | 'quote',
  name: string
): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `insert into custom_field_definitions
         (id, name, label, "fieldType", "entityType", "sortOrder", "isActive",
          "createdAt", "updatedAt", "userId", "organizationId")
       values (gen_random_uuid()::text, $2, $2, 'text', $3, 0, true, now(), now(),
               (select "userId" from organization_members
                 where "organizationId" = $1 and role = 'owner' limit 1),
               $1)
       returning id`,
      [organizationId, name, entityType]
    )
    return result.rows[0].id
  })
}

/** Removes planted field definitions, and the values written into them. */
export async function deleteCustomFields(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await withDb(async (db) => {
    await db.query(`delete from custom_field_values where "fieldId" = any($1::text[])`, [ids])
    await db.query(`delete from custom_field_definitions where id = any($1::text[])`, [ids])
  })
}

/**
 * The value stored in one custom field for one record, or null.
 *
 * Read back to prove a save from the browser reached the database rather than
 * only the input it was typed into.
 */
export async function customFieldValue(fieldId: string, entityId: string): Promise<string | null> {
  return withDb(async (db) => {
    const result = await db.query<{ value: string }>(
      `select value from custom_field_values where "fieldId" = $1 and "entityId" = $2`,
      [fieldId, entityId]
    )
    return result.rows[0]?.value ?? null
  })
}

/**
 * A workshop's own role by name, as `createDefaultRoles` made it.
 *
 * The built-in Member role is what the product really hands somebody at the
 * desk, so a spec about that role has to use that row rather than build an
 * equivalent permission list by hand: a list assembled in the test would keep
 * passing after the real role changed underneath it.
 */
export async function roleIdNamed(organizationId: string, name: string): Promise<string | null> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `select id from roles where "organizationId" = $1 and name = $2 limit 1`,
      [organizationId, name]
    )
    return result.rows[0]?.id ?? null
  })
}
