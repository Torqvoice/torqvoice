import { FeatureGatedError, getFeatures } from '@/lib/features'
import { channelProvider } from '@/features/integrations/Lib/messaging'

/**
 * How many customer mails a workshop without its own mail provider may send
 * from the platform's address in one day, on a plan without custom email.
 * Enough for a busy workshop's invoices and quotes; too few for anyone using
 * a free account to send bulk mail from the platform's domain.
 */
export const PLATFORM_MAIL_DAILY_LIMIT = 50

type Counter = { day: string; count: number }

// On globalThis so the count survives the module being loaded twice, which
// Next does for server actions and route handlers.
const globalForAllowance = globalThis as unknown as {
  platformMailSent?: Map<string, Counter>
}
const sent = (globalForAllowance.platformMailSent ??= new Map<string, Counter>())

function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * The check before a workshop mails a customer an invoice, quote, inspection
 * or message, and what it costs.
 *
 * Sending through the workshop's own mail provider is the paid custom email
 * feature. A workshop with no provider sends from the platform's address, and
 * every plan may do that: the first invoice a customer receives is when the
 * app proves itself, and it used to sit behind the upgrade. On a plan without
 * custom email those platform sends count against a daily allowance.
 */
export async function requireEmailSending(organizationId: string, now = new Date()) {
  const features = await getFeatures(organizationId)
  if (features.smtp) return

  // A workshop that connected its own provider on Pro and then dropped back
  // to free. Sending would go through that provider, which the plan no longer
  // includes, so it is refused as before.
  if (await channelProvider(organizationId, 'email')) {
    throw new FeatureGatedError('smtp')
  }

  const day = today(now)
  const counter = sent.get(organizationId)
  const count = counter?.day === day ? counter.count : 0
  if (count >= PLATFORM_MAIL_DAILY_LIMIT) {
    throw new FeatureGatedError(
      'platformMailDaily',
      `Daily email limit of ${PLATFORM_MAIL_DAILY_LIMIT} reached. Upgrade to send more.`,
      PLATFORM_MAIL_DAILY_LIMIT
    )
  }
  sent.set(organizationId, { day, count: count + 1 })
}

/** Forgets every count. For tests. */
export function resetPlatformMailAllowance() {
  sent.clear()
}
