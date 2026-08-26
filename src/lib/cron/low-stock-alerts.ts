import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { sendOrgMail, getOrgFromAddress } from '@/lib/email'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  buildAlertSummary,
  canSendDigestEmail,
  decideLowStockAlerts,
  formatLowStockLine,
  type LowStockCandidate,
} from '@/features/inventory/Lib/lowStockAlerts'

const LOG_PREFIX = '[low-stock]'
const DEFAULT_EMAIL_MIN_INTERVAL_HOURS = 24

interface OrgAlertSettings {
  enabled: boolean
  inApp: boolean
  email: boolean
  emailMinIntervalHours: number
  lastEmailAt: Date | null
  defaultThreshold: number
}

function readSettings(rows: { key: string; value: string }[]): OrgAlertSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const parsedInterval = Number(map.get(SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL_MIN_INTERVAL_HOURS))
  const parsedThreshold = Number(map.get(SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD))
  const lastRaw = map.get(SETTING_KEYS.LOW_STOCK_ALERTS_LAST_EMAIL_AT)
  const lastEmailAt = lastRaw ? new Date(lastRaw) : null

  return {
    enabled: map.get(SETTING_KEYS.LOW_STOCK_ALERTS_ENABLED) === 'true',
    // Channels default on/off respectively; only meaningful when enabled.
    inApp: map.get(SETTING_KEYS.LOW_STOCK_ALERTS_IN_APP) !== 'false',
    email: map.get(SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL) === 'true',
    emailMinIntervalHours:
      Number.isFinite(parsedInterval) && parsedInterval > 0
        ? parsedInterval
        : DEFAULT_EMAIL_MIN_INTERVAL_HOURS,
    lastEmailAt: lastEmailAt && !Number.isNaN(lastEmailAt.getTime()) ? lastEmailAt : null,
    defaultThreshold: Number.isFinite(parsedThreshold) && parsedThreshold > 0 ? parsedThreshold : 0,
  }
}

/** Owners and admins receive the digest. */
async function getRecipients(organizationId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId, role: { in: ['owner', 'admin'] } },
    select: { user: { select: { email: true, name: true } } },
  })
  return members.map((m) => m.user).filter((u): u is { email: string; name: string } => !!u?.email)
}

async function sendDigest(
  organizationId: string,
  parts: LowStockCandidate[],
  now: Date,
  defaultThreshold: number
) {
  const recipients = await getRecipients(organizationId)
  if (recipients.length === 0) return false

  const org = await db.organization
    .findUnique({ where: { id: organizationId }, select: { name: true } })
    .catch(() => null)

  // Resolving the sender reads the org's email provider settings — exactly
  // what is broken when email is misconfigured. Without a sender there is no
  // honest way to send, so skip the digest rather than invent an address. The
  // in-app notification has already gone out and the parts are still marked by
  // the caller, so nothing is lost but this one email.
  let fromAddress: string
  try {
    fromAddress = await getOrgFromAddress(organizationId)
  } catch (error) {
    console.error(
      `${LOG_PREFIX} email is misconfigured (could not resolve sender); skipping digest:`,
      error
    )
    return false
  }

  const rows = parts.map((p) => `<li>${formatLowStockLine(p, defaultThreshold)}</li>`).join('')
  const subject =
    parts.length === 1
      ? `Low stock: ${parts[0].name}`
      : `Low stock: ${parts.length} parts need reordering`

  let sent = 0
  for (const recipient of recipients) {
    try {
      await sendOrgMail(organizationId, {
        to: recipient.email,
        subject,
        from: fromAddress,
        html:
          `<p>Hi ${recipient.name || ''},</p>` +
          `<p>The following parts at <strong>${org?.name ?? 'your workshop'}</strong> ` +
          `have reached their reorder point:</p><ul>${rows}</ul>` +
          `<p>You are receiving this because low-stock alerts are enabled in ` +
          `Settings. Each part is reported once. You will not be reminded ` +
          `again until it is restocked and drops low a second time.</p>`,
      })
      sent++
    } catch (error) {
      console.error(`${LOG_PREFIX} email to ${recipient.email} failed:`, error)
    }
  }

  if (sent === 0) return false

  // Record the send so the minimum-interval throttle holds across runs.
  try {
    await db.appSetting.upsert({
      where: {
        organizationId_key: {
          organizationId,
          key: SETTING_KEYS.LOW_STOCK_ALERTS_LAST_EMAIL_AT,
        },
      },
      create: {
        organizationId,
        key: SETTING_KEYS.LOW_STOCK_ALERTS_LAST_EMAIL_AT,
        value: now.toISOString(),
        // AppSetting requires a userId; attribute automated writes to an owner.
        userId:
          (
            await db.organizationMember.findFirst({
              where: { organizationId, role: 'owner' },
              select: { userId: true },
            })
          )?.userId ?? '',
      },
      update: { value: now.toISOString() },
    })
  } catch (error) {
    // Losing the timestamp only costs an extra digest later; never fail here.
    console.error(`${LOG_PREFIX} could not record last-email time:`, error)
  }

  return true
}

/**
 * Process one organization. Exported so it can be driven directly from a test
 * or an admin action without waiting for the schedule.
 */
export async function processOrgLowStock(organizationId: string, now = new Date()) {
  const settingRows = await db.appSetting.findMany({
    where: {
      organizationId,
      key: {
        in: [
          SETTING_KEYS.LOW_STOCK_ALERTS_ENABLED,
          SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD,
          SETTING_KEYS.LOW_STOCK_ALERTS_IN_APP,
          SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL,
          SETTING_KEYS.LOW_STOCK_ALERTS_EMAIL_MIN_INTERVAL_HOURS,
          SETTING_KEYS.LOW_STOCK_ALERTS_LAST_EMAIL_AT,
        ],
      },
    },
    select: { key: true, value: true },
  })

  const settings = readSettings(settingRows)
  if (!settings.enabled) return { skipped: true as const }

  // Only two groups can change state: parts that are currently low (may need
  // alerting) and parts still carrying a marker (may need re-arming). Filtering
  // in SQL rather than loading the whole inventory keeps this cheap enough to
  // run on every stock movement, not just on the hourly sweep.
  //
  // The COALESCE mirrors effectiveThreshold(): the part's own reorder point
  // wins, else the org-wide default.
  const threshold = settings.defaultThreshold
  const candidates = await db.$queryRaw<
    {
      id: string
      name: string
      partNumber: string | null
      quantity: number
      minQuantity: number
      unit: string | null
      lowStockAlertedAt: Date | null
    }[]
  >`
    SELECT "id", "name", "partNumber", "quantity", "minQuantity", "unit", "lowStockAlertedAt"
    FROM "inventory_parts"
    WHERE "organizationId" = ${organizationId}
      AND "isArchived" = false
      AND (
        (
          COALESCE(NULLIF("minQuantity", 0), ${threshold}) > 0
          AND "quantity" <= COALESCE(NULLIF("minQuantity", 0), ${threshold})
        )
        OR "lowStockAlertedAt" IS NOT NULL
      )
  `

  const { newlyLow, toRearm } = decideLowStockAlerts(candidates, settings.defaultThreshold)

  // Recovered parts are re-armed even when nothing new is low, so the next dip
  // is reported.
  if (toRearm.length > 0) {
    await db.inventoryPart.updateMany({
      where: { id: { in: toRearm }, organizationId },
      data: { lowStockAlertedAt: null },
    })
  }

  if (newlyLow.length === 0) {
    return { skipped: false as const, alerted: 0, rearmed: toRearm.length, emailed: false }
  }

  if (settings.inApp) {
    // One grouped notification, never one per part.
    const summary = buildAlertSummary(newlyLow, settings.defaultThreshold)
    await notify({
      organizationId,
      type: 'inventory.lowStock',
      title: summary.title,
      message: summary.message,
      entityType: 'InventoryPart',
      entityId: newlyLow.length === 1 ? newlyLow[0].id : '',
      entityUrl: newlyLow.length === 1 ? `/inventory/${newlyLow[0].id}` : '/inventory?lowStock=1',
    })
  }

  let emailed = false
  if (
    settings.email &&
    canSendDigestEmail(settings.lastEmailAt, now, settings.emailMinIntervalHours)
  ) {
    // Isolated deliberately. If a misconfigured mail server throws here and the
    // error escaped, the marking below would be skipped and these same parts
    // would be re-reported on every subsequent run — a broken SMTP setting
    // would turn into in-app notification spam. Email is best-effort; the
    // ledger of what has been alerted is not.
    try {
      emailed = await sendDigest(organizationId, newlyLow, now, settings.defaultThreshold)
    } catch (error) {
      console.error(`${LOG_PREFIX} digest email failed:`, error)
    }
  }

  // Marking always happens, even if the email leg failed above.
  await db.inventoryPart.updateMany({
    where: { id: { in: newlyLow.map((p) => p.id) }, organizationId },
    data: { lowStockAlertedAt: now },
  })

  return {
    skipped: false as const,
    alerted: newlyLow.length,
    rearmed: toRearm.length,
    emailed,
  }
}

/** Hourly low-stock scan. Organizations opt in via settings. */
export function checkLowStock() {
  const job = new CronJob('15 * * * *', async () => {
    try {
      // Only organizations that switched the feature on.
      const enabled = await db.appSetting.findMany({
        where: { key: SETTING_KEYS.LOW_STOCK_ALERTS_ENABLED, value: 'true' },
        select: { organizationId: true },
      })

      let alerted = 0
      for (const row of enabled) {
        if (!row.organizationId) continue
        try {
          const result = await processOrgLowStock(row.organizationId)
          if (!result.skipped) alerted += result.alerted
        } catch (error) {
          console.error(`${LOG_PREFIX} org ${row.organizationId} failed:`, error)
        }
      }

      if (alerted > 0) {
        console.warn(`${LOG_PREFIX} alerted on ${alerted} newly low part(s)`)
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} scan failed:`, error)
    }
  })

  job.start()
}
