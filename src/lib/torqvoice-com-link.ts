import { billingRequest, isTorqvoiceComBillingConfigured, TorqvoiceComError } from './torqvoice-com'

/**
 * Whether this app is the one torqvoice.com bills for.
 *
 * `TORQVOICE_MODE=cloud` is a line anyone can put in an environment file,
 * and a self-hosted install that does so should not grow a subscription
 * page pointing at a checkout that will refuse it. So the pages that only
 * make sense on app.torqvoice.com show when the site has confirmed the
 * link: the shared secret matched and this origin is on its allowlist.
 *
 * The answer is remembered in memory and served from there: a page never
 * waits on the network once an answer exists, a stale one is refreshed in
 * the background. A yes lasts an hour. A refusal (wrong secret, origin not
 * listed) is a definite no, asked again after two minutes. A site that
 * cannot be reached changes nothing: a linked app stays linked, an unlinked
 * one is asked again after two minutes. Every change of answer is logged,
 * so a mistyped secret shows up in the container log rather than as a
 * silently missing page.
 *
 * Feature gating is deliberately not tied to this: what a plan unlocks
 * still follows the subscription row alone.
 */

/** An hour and two minutes, or what the environment says: the e2e harness flips the answer mid-run. */
const LINKED_TTL_MS = (Number(process.env.TORQVOICE_COM_LINK_TTL_SECONDS) || 3600) * 1000
const UNLINKED_RETRY_MS = (Number(process.env.TORQVOICE_COM_LINK_RETRY_SECONDS) || 120) * 1000
/** A settings page must not hang on this; the site answers in milliseconds. */
const PING_TIMEOUT_MS = 3_000

type Answer = 'yes' | 'no' | 'unreachable'
type LinkState = { linked: boolean; checkedAt: number }

let state: LinkState | null = null
let inFlight: Promise<boolean> | null = null

async function ask(): Promise<Answer> {
  try {
    const result = await billingRequest<{ linked?: boolean }>('ping', {}, PING_TIMEOUT_MS)
    return result.linked === true ? 'yes' : 'no'
  } catch (error) {
    const refused =
      error instanceof TorqvoiceComError &&
      (error.upstreamStatus === 401 || error.upstreamStatus === 403)
    if (refused) {
      console.error(
        `[torqvoice.com] link refused (${error.upstreamStatus}): the site did not accept this app. Check TORQVOICE_SERVICE_SECRET and that ${process.env.NEXT_PUBLIC_APP_URL} is listed on torqvoice.com.`
      )
      return 'no'
    }
    return 'unreachable'
  }
}

function record(answer: Answer, now: number): boolean {
  const before = state?.linked
  const linked = answer === 'yes' ? true : answer === 'no' ? false : (state?.linked ?? false)
  state = { linked, checkedAt: now }
  if (before !== undefined && before !== linked) {
    console.warn(`[torqvoice.com] link is now ${linked ? 'confirmed' : 'refused'}`)
  }
  return linked
}

function refresh(now: number): Promise<boolean> {
  if (!inFlight) {
    inFlight = ask()
      .then((answer) => record(answer, now))
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

export async function isCloudLinked(now = Date.now()): Promise<boolean> {
  if (!isTorqvoiceComBillingConfigured()) return false

  if (!state) return refresh(now)

  const age = now - state.checkedAt
  const stale = state.linked ? age >= LINKED_TTL_MS : age >= UNLINKED_RETRY_MS
  if (stale) void refresh(now).catch(() => undefined)
  return state.linked
}

/** Only for tests. */
export function resetCloudLinkForTests() {
  state = null
  inFlight = null
}
