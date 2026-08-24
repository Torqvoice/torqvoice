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
 * Throws inside a server action when demo mode is active. `withAuth`
 * catches the error and surfaces it as `{ success: false, error }` to
 * the client, which shows it as a toast.
 */
export function demoGuard(): void {
  if (isDemoMode) {
    throw new Error(
      'This action is disabled on the demo. Install Torqvoice on your own server to use it.'
    )
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
export function assertOutboundAllowed(channel: 'email' | 'sms' | 'whatsapp' | 'telegram'): void {
  if (isDemoMode) {
    throw new Error(
      `Outbound ${channel} is disabled on the demo. Install Torqvoice on your own server to send for real.`
    )
  }
}

/**
 * Setting keys that store provider credentials / secrets. Demo visitors
 * shouldn't be able to paste real API keys into a shared demo DB.
 */
const DEMO_BLOCKED_SETTING_KEY_PATTERNS: RegExp[] = [
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
    throw new Error("This setting can't be changed on the demo.")
  }
}
