'use client'

import posthog from 'posthog-js'

/**
 * Product analytics events, and the only way the app sends them.
 *
 * PostHog runs in cloud mode and on the demo instance; a self-hosted install
 * never starts it, and then nothing here sends anything.
 *
 * Calls made before PostHog has started are held and sent once it has. The
 * provider starts it in an effect in the root layout, and React runs a page's
 * effects before its layout's, so an event fired when a page mounts would
 * otherwise be dropped on every full page load.
 *
 * Names follow PostHog's guide: lowercase snake case, fixed strings,
 * `category:object_action` with a present-tense verb. Anything that varies
 * goes in a property, never in the name.
 */

export type AnalyticsEvent =
  /** A work order opened, with the layout it was drawn in. */
  | 'work_order:page_view'
  /** A browser moved between the classic and the overhauled work order page. */
  | 'work_order:layout_switch'
  /** The invitation to try the overhauled page closed without trying it. */
  | 'work_order:layout_invite_dismiss'
  /** An account made with email and password. Google sign-ups show as workshop:create. */
  | 'account:sign_up'
  /** The onboarding form made the person's first workshop, with or without sample data. */
  | 'workshop:create'
  /** A customer saved from the customer form. */
  | 'customer:create'
  /** An invoice, quote or inspection emailed to the customer. */
  | 'document:email_send'
  /** An action the plan refused; the upgrade dialog opened. */
  | 'plan:gate_show'
  /** The upgrade dialog's button to the plans. */
  | 'plan:upgrade_click'

type Properties = Record<string, string | number | boolean | null>

type Pending =
  | { kind: 'capture'; event: AnalyticsEvent; properties?: Properties }
  | { kind: 'register'; properties: Properties }
  | { kind: 'identify'; userId: string; organizationId: string }
  | { kind: 'reset' }

/** A page opened and closed many times before PostHog starts, or on an install that never does. */
const MAX_PENDING = 20

let ready = false
const pending: Pending[] = []

function hold(item: Pending) {
  if (pending.length < MAX_PENDING) pending.push(item)
}

/** Sends one event, or holds it until PostHog has started. */
export function track(event: AnalyticsEvent, properties?: Properties): void {
  if (ready) posthog.capture(event, properties)
  else hold({ kind: 'capture', event, properties })
}

/**
 * Attaches properties to every later event from this browser, autocaptured
 * clicks and page views included (PostHog's super properties). For facts
 * about the browser rather than about one action: the layout it shows, say.
 */
export function registerAnalyticsProperties(properties: Properties): void {
  if (ready) posthog.register(properties)
  else hold({ kind: 'register', properties })
}

/**
 * Ties this browser to the signed-in account and its workshop.
 *
 * Without it every browser was a separate person, so someone who signed up
 * on a laptop and came back on a phone counted as one person who left and
 * another who arrived. Only ids go to PostHog: no name, no email. The
 * workshop is a group, so a workshop's activity can be counted whoever in it
 * did the work.
 */
export function identifyUser(userId: string, organizationId: string): void {
  if (ready) sendIdentify(userId, organizationId)
  else hold({ kind: 'identify', userId, organizationId })
}

/** Forgets the account on sign-out, so the next person on this browser is not merged into it. */
export function resetAnalytics(): void {
  if (ready) posthog.reset()
  else hold({ kind: 'reset' })
}

function sendIdentify(userId: string, organizationId: string) {
  // Already this person: identify again would only add a request per page.
  if (posthog.get_distinct_id?.() !== userId) posthog.identify(userId)
  posthog.group('organization', organizationId)
}

/** Called by the provider once PostHog has started: sends what was held, in order. */
export function analyticsStarted(): void {
  ready = true
  for (const item of pending.splice(0)) {
    if (item.kind === 'register') posthog.register(item.properties)
    else if (item.kind === 'identify') sendIdentify(item.userId, item.organizationId)
    else if (item.kind === 'reset') posthog.reset()
    else posthog.capture(item.event, item.properties)
  }
}
