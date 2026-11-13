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
  /** A work order opened. */
  | 'work_order:page_view'
  /**
   * The vehicle page switched between its classic and new layouts: `to_layout`
   * which one, `source` the invitation or the menu. Switches back to classic
   * say what the new page still lacks.
   */
  | 'vehicle_page:layout_switch'
  /** The invitation to the new vehicle page closed without trying it. */
  | 'vehicle_page:layout_invite_dismiss'
  /** An account made with email and password. Google sign-ups show as workshop:create. */
  | 'account:sign_up'
  /** The onboarding form made the person's first workshop, with or without sample data. */
  | 'workshop:create'
  /** The guided setup opened, with what the browser suggested: country, languages, time zone. */
  | 'workshop:setup_start'
  /**
   * The setup moved between steps: `action` is continue, skip, back or jump
   * (the step bar or an Edit link), with the seconds spent on the step left.
   */
  | 'workshop:setup_step'
  /** Continue pressed while the step was incomplete; `reason` names what was missing. */
  | 'workshop:setup_blocked'
  /** The language changed: `via` the language field, a country, or the customer language. */
  | 'workshop:setup_language_change'
  /** The owner picked a country, replacing the detected one or another pick. */
  | 'workshop:setup_country_change'
  /** A suggested regional value opened for editing; `field` says which. */
  | 'workshop:setup_suggestion_edit'
  /** The invoice preview opened at full size. */
  | 'workshop:setup_preview_open'
  /** Create workshop failed; the error dialog opened. */
  | 'workshop:setup_create_fail'
  /** A customer saved from the customer form. */
  | 'customer:create'
  /** An invoice, quote or inspection emailed to the customer. */
  | 'document:email_send'
  /** An action the plan refused; the upgrade dialog opened. */
  | 'plan:gate_show'
  /** The upgrade dialog's button to the plans. */
  | 'plan:upgrade_click'
  /**
   * A fault code opened, on its page or in the sheet beside a job: `kind` obd or make,
   * `make` for a make's own code, and `found`, whether we had a meaning for it. The misses
   * say which codes and makes to add next.
   */
  | 'fault_code:page_view'
  /** The lookup box submitted: `kind` code, make_code or words. The words are never sent. */
  | 'fault_code:search'
  /** A make's own meaning opened from a standard code's page (Ford's P1000 from P1000). */
  | 'fault_code:make_code_open'
  /** Support asked about the code on screen. */
  | 'fault_code:support_open'
  /** A wrong meaning reported, with its `reason`. */
  | 'fault_code:report_send'
  /** A fix shared for review, with how many photos and whether any came from a phone. */
  | 'fault_code:fix_share'
  /** Research a fix pressed. */
  | 'fault_code:research_start'
  /** What research came back with: `outcome` pending, published, missed, busy, limited or failed. */
  | 'fault_code:research_result'
  /** A researched fix rated, `helpful` or not. */
  | 'fault_code:research_rate'
  /** A shared waveform opened full size, `kind` good or faulty. */
  | 'fault_code:waveform_open'
  /** Another waveform drawn under the open one to compare. */
  | 'fault_code:waveform_compare'
  /** A waveform's file downloaded: `role` psdata, csv or pssettings. */
  | 'fault_code:waveform_download'
  /** A waveform shared for review, with which files it carried. */
  | 'fault_code:waveform_share'
  /** Help us improve opened, and sent with its `topic`. */
  | 'fault_code:improve_open'
  | 'fault_code:improve_send'
  /** The import dialog opened. */
  | 'fault_code:import_open'
  /** An example file downloaded: `format` xlsx, csv or json. */
  | 'fault_code:import_example_download'
  /** A file checked: its `make`, `file_type` and how many rows were new, changes, the same or problems. */
  | 'fault_code:import_check'
  /** An import sent for review: its `make` and how many `codes`. */
  | 'fault_code:import_send'

type Properties = Record<string, string | number | boolean | null>

type Pending =
  | { kind: 'capture'; event: AnalyticsEvent; properties?: Properties }
  | { kind: 'exception'; error: unknown; properties?: Properties }
  | { kind: 'register'; properties: Properties }
  | { kind: 'unregister'; names: string[] }
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
 * Sends an error a person was shown, with its stack, or holds it until
 * PostHog has started.
 *
 * For errors the app catches itself, the error pages above all. PostHog's own
 * exception capture listens for uncaught errors, and an error page is React
 * catching one, so without this nobody learns which page broke or why.
 */
export function reportError(error: unknown, properties?: Properties): void {
  if (ready) posthog.captureException(error, properties)
  else hold({ kind: 'exception', error, properties })
}

/**
 * Attaches properties to every later event from this browser, autocaptured
 * clicks and page views included (PostHog's super properties). For facts
 * about the browser rather than about one action: the setup step it is on, say.
 */
export function registerAnalyticsProperties(properties: Properties): void {
  if (ready) posthog.register(properties)
  else hold({ kind: 'register', properties })
}

/** Stops attaching properties registered with registerAnalyticsProperties. */
export function unregisterAnalyticsProperties(names: string[]): void {
  if (ready) for (const name of names) posthog.unregister(name)
  else hold({ kind: 'unregister', names })
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
    else if (item.kind === 'unregister') for (const name of item.names) posthog.unregister(name)
    else if (item.kind === 'identify') sendIdentify(item.userId, item.organizationId)
    else if (item.kind === 'reset') posthog.reset()
    else if (item.kind === 'exception') posthog.captureException(item.error, item.properties)
    else posthog.capture(item.event, item.properties)
  }
}
