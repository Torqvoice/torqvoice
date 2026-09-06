import Stripe from 'stripe'
import type { ConnectorContext, ConnectorServer } from '@/features/integrations/Lib/types'
import { manifest } from './manifest'

function secretKeyOf(ctx: ConnectorContext): string {
  const key = ctx.credentials.secretKey
  return typeof key === 'string' ? key.trim() : ''
}

/** What Stripe calls the account, in the order a workshop would recognise it. */
function accountName(account: Stripe.Account): string {
  return (
    account.settings?.dashboard?.display_name ||
    account.business_profile?.name ||
    account.email ||
    account.id
  )
}

/**
 * Reading the account back is the cheapest call that proves a secret key,
 * and it also tells us whose account it is. Stripe answers a bad key with
 * an authentication error rather than a status code we would have to guess at.
 */
export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const secretKey = secretKeyOf(ctx)
    if (!secretKey) return { ok: false, message: 'Stripe: a secret key is required' }
    try {
      await new Stripe(secretKey).accounts.retrieve()
      return { ok: true }
    } catch (err) {
      if (err instanceof Stripe.errors.StripeAuthenticationError) {
        return { ok: false, message: 'Stripe rejected the secret key' }
      }
      return { ok: false, message: err instanceof Error ? err.message : 'Stripe did not answer' }
    }
  },

  async identify(ctx) {
    const account = await new Stripe(secretKeyOf(ctx)).accounts.retrieve()
    return { id: account.id, name: accountName(account) }
  },

  jobs: {},
}
