import { db } from '@/lib/db'
import { FeatureGatedError, getFeatures } from '@/lib/features'
import { channelProvider } from '@/features/integrations/Lib/messaging'

/**
 * How many customer mails a workshop without its own mail provider may send
 * from the platform's address in one day, on a plan without custom email.
 * Enough for a busy workshop's invoices and quotes; too few for anyone using
 * a free account to send bulk mail from the platform's domain.
 */
export const PLATFORM_MAIL_DAILY_LIMIT = 50

function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** How this workshop's customer mail goes out, when it may go out at all. */
export type EmailSendingMode = 'unlimited' | 'platform'

/**
 * Whether this workshop may email its customers, and through what. Spends
 * nothing: call it first, before looking anything up.
 *
 * Sending through the workshop's own mail provider is the paid custom email
 * feature. A workshop with no provider sends from the platform's address, and
 * every plan may do that: the first invoice a customer receives is when the
 * app proves itself, and it used to sit behind the upgrade. On a plan without
 * custom email those platform sends count against a daily allowance, taken by
 * `withPlatformMailAllowance` around the send itself.
 */
export async function requireEmailSending(organizationId: string): Promise<EmailSendingMode> {
  const features = await getFeatures(organizationId)
  if (features.smtp) return 'unlimited'

  // A workshop that connected its own provider on Pro and then dropped back
  // to free. Sending would go through that provider, which the plan no longer
  // includes, so it is refused as before.
  if (await channelProvider(organizationId, 'email')) {
    throw new FeatureGatedError('smtp')
  }
  return 'platform'
}

/**
 * Whether the email controls should show for this workshop: the same answer
 * as `requireEmailSending`, without throwing. Pages used to show them only on
 * plans with custom email, which hid them from every free workshop.
 */
export async function canEmailCustomers(organizationId: string): Promise<boolean> {
  try {
    await requireEmailSending(organizationId)
    return true
  } catch {
    return false
  }
}

/**
 * Takes one slot of today's allowance. Atomic: the row is created if it is
 * missing, and the increment only happens while the count is under the limit,
 * so two sends racing for the last slot cannot both get it.
 */
async function takeSlot(organizationId: string, day: string): Promise<boolean> {
  await db.platformMailUsage.createMany({
    data: [{ organizationId, day, count: 0 }],
    skipDuplicates: true,
  })
  const taken = await db.platformMailUsage.updateMany({
    where: { organizationId, day, count: { lt: PLATFORM_MAIL_DAILY_LIMIT } },
    data: { count: { increment: 1 } },
  })
  return taken.count === 1
}

async function giveBack(organizationId: string, day: string) {
  await db.platformMailUsage.updateMany({
    where: { organizationId, day, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  })
}

/**
 * Runs one send under the daily allowance. Call it around the send itself,
 * after every lookup that can fail, so a missing quote or a disabled mailbox
 * never uses up a slot. A send that throws gives its slot back.
 */
export async function withPlatformMailAllowance<T>(
  organizationId: string,
  mode: EmailSendingMode,
  send: () => Promise<T>,
  now = new Date()
): Promise<T> {
  if (mode === 'unlimited') return send()

  const day = today(now)
  if (!(await takeSlot(organizationId, day))) {
    throw new FeatureGatedError(
      'platformMailDaily',
      `Daily email limit of ${PLATFORM_MAIL_DAILY_LIMIT} reached. Upgrade to send more.`,
      PLATFORM_MAIL_DAILY_LIMIT
    )
  }
  try {
    return await send()
  } catch (error) {
    await giveBack(organizationId, day)
    throw error
  }
}
