/**
 * Demo-mode utilities.
 *
 * When `DEMO_MODE=true`, actions that would send external messages,
 * invite users, or touch billing/admin-level state are blocked so the
 * public demo instance at demo.torqvoice.com can't be abused.
 *
 * Regular CRUD (customers, vehicles, service records, settings, ...) is
 * intentionally NOT blocked — demo visitors should be able to play with
 * the app. The reset cron (every 3 hours) reverts their changes.
 */

export const isDemoMode = process.env.DEMO_MODE === 'true'

/** Credentials the sign-in page auto-fills. The seed script provisions this user. */
export const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL || 'demo@torqvoice.com'
export const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD || 'demo'

/**
 * Where a demo visitor is sent when something is off here: the hosted app,
 * free to start, is where the thing they just tried works with their own
 * workshop. Every refusal on the demo ends with it, so it reads the same.
 */
export const DEMO_SIGN_UP =
  'Create a free account at app.torqvoice.com to use it with your own workshop.'

/** The refusal for anything the demo turns off without a more specific word for it. */
export const DEMO_DISABLED_MESSAGE = `This is turned off on the demo. ${DEMO_SIGN_UP}`

/** A refusal naming what is off, ending with the same way on. */
export function demoOffMessage(what: string): string {
  return `${what} is turned off on the demo. ${DEMO_SIGN_UP}`
}

/**
 * Throws inside a server action when demo mode is active. `withAuth`
 * catches the error and surfaces it as `{ success: false, error }` to
 * the client, which shows it as a toast.
 */
export function demoGuard(): void {
  if (isDemoMode) {
    throw new Error(DEMO_DISABLED_MESSAGE)
  }
}

/**
 * Hard stop on anything that would leave the box: email, SMS, WhatsApp, Telegram.
 *
 * `demoGuard()` only covers server actions, so the background crons —
 * scheduled messages, reminder alerts, report schedules, low-stock digests —
 * went straight past it and out through the platform sender. This sits in the
 * transports themselves, which is the one place every one of those paths has
 * to go through. Seed data carries customer-looking addresses, so a demo reset
 * is enough to queue mail at real inboxes without it.
 */
const CHANNEL_NAMES = {
  email: 'email',
  sms: 'SMS',
  whatsapp: 'WhatsApp messages',
  telegram: 'Telegram messages',
} as const

export function assertOutboundAllowed(channel: 'email' | 'sms' | 'whatsapp' | 'telegram'): void {
  if (isDemoMode) {
    throw new Error(
      `Sending ${CHANNEL_NAMES[channel]} is turned off on the demo, so no real customer is contacted. ${DEMO_SIGN_UP}`
    )
  }
}

/**
 * Hard stop for the integrations catalog: every connector call runs with a
 * context built by `loadConnection`, goes out through the connector HTTP
 * client, or exchanges a token through the OAuth module, and all three
 * refuse here. The actions that connect a vendor already refuse, so no
 * connection should exist on the demo; this is for the one that does.
 */
export function assertConnectorAllowed(): void {
  if (isDemoMode) {
    throw new Error(demoOffMessage('Connecting integrations'))
  }
}

/**
 * Setting keys that store provider credentials / secrets. Demo visitors
 * shouldn't be able to paste real API keys into a shared demo DB.
 */
const DEMO_BLOCKED_SETTING_KEY_PATTERNS: RegExp[] = [
  // The licence page refuses on the demo, but setSettings takes any key: a key
  // pasted here would be sent to torqvoice.com by the daily check, and the
  // cached plan and validity rows are what a self-hosted install's plan is
  // read from. None of them is anything a visitor has a reason to write.
  /^license\./,
  /^payment\.(stripe|vipps|paypal)\./,
  /^payment\.providersEnabled$/,
  // Each provider's own settings action already refuses in demo mode, but
  // setSettings is a plain server action that takes any key at all, so
  // without these the guarded page is a locked front door beside an open
  // window. Nothing outbound can leave the demo either way; the point is that
  // a visitor's real credentials never land in a database twenty strangers
  // share. Templates and the enabled flags stay open, so the demo is still
  // something you can play with.
  /^sms\.(twilio|vonage|telnyx)\./,
  /^sms\.(provider|phoneNumber|webhookSecret)$/,
  /^telegram\.(botToken|webhookSecret)$/,
  // WhatsApp namespaces credentials by provider rather than enumerating them,
  // so this matches the namespace and any adapter added later is covered
  // without another entry here. The template keys stay open, since an approved
  // template name is not a secret and is worth playing with.
  /^whatsapp\.cred\./,
  /^whatsapp\.(provider|from)$/,
  /^email\.(smtp|resend|sendgrid|mailgun|postmark|ses)\./,
  /^email\.provider$/,
  /^ai\.apiKey$/,
]

export function isDemoBlockedSettingKey(key: string): boolean {
  return DEMO_BLOCKED_SETTING_KEY_PATTERNS.some((p) => p.test(key))
}

/**
 * Guard for settings writes — throws if the key stores a credential/secret.
 * Safe keys (theme, language, date format, ...) pass through.
 */
export function demoGuardSettingKey(key: string): void {
  if (isDemoMode && isDemoBlockedSettingKey(key)) {
    throw new Error(`Saving credentials is turned off on the demo. ${DEMO_SIGN_UP}`)
  }
}

/** What a refused AI or dictation request is told on the demo. */
export const DEMO_AI_DISABLED_MESSAGE = demoOffMessage('AI')

/**
 * Hard stop for the AI and speech vendors. Connecting one is refused on the
 * demo already, so no key should exist there; this is for the one that does,
 * because every prompt carries somebody's workshop data and every call is
 * billed to whoever owns the key. The setup lookups report "not configured"
 * so the pages hide their AI buttons, and the client itself refuses to be
 * built, so nothing reaches a vendor whichever path asks.
 */
export function assertAiAllowed(): void {
  if (isDemoMode) throw new Error(DEMO_AI_DISABLED_MESSAGE)
}
