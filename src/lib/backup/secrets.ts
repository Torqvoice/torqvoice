/**
 * Which settings are secret keys, and how a backup leaves them out.
 *
 * A backup written with "Data only" carries REDACTED in place of each secret.
 * A restore keeps whatever the install has for those keys, so restoring an
 * older file never wipes a key someone entered since.
 */
import { AI_KEYS } from '@/features/ai/Schema/aiSettingsSchema'
import { ORG_EMAIL_KEYS } from '@/features/email/Schema/emailSettingsSchema'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { ORG_SMS_KEYS } from '@/features/sms/Schema/smsSettingsSchema'
import { ORG_TELEGRAM_KEYS } from '@/features/telegram/Schema/telegramSettingsSchema'
import { ORG_WHATSAPP_KEYS } from '@/features/whatsapp/Schema/whatsappSettingsSchema'

export const REDACTED = '__torqvoice_redacted__'

const SECRET_NAME = /SECRET|PASSWORD|_PASS$|API_KEY|TOKEN/
const SECRET_SUFFIX =
  /\.(secretKey|clientSecret|webhookSecret|apiKey|apiSecret|token|password|pass)$/

/** Credentials whose names say "key" without saying which kind. */
const NAMED_SECRETS: readonly string[] = [
  SETTING_KEYS.PAYMENT_VIPPS_SUBSCRIPTION_KEY,
  SETTING_KEYS.LICENSE_KEY,
]

/** Every provider credential WhatsApp stores lives under this prefix. */
const SECRET_PREFIXES: readonly string[] = ['whatsapp.cred.']

const KEY_MAPS: Record<string, string>[] = [
  SETTING_KEYS,
  ORG_SMS_KEYS,
  ORG_EMAIL_KEYS,
  ORG_TELEGRAM_KEYS,
  ORG_WHATSAPP_KEYS,
  AI_KEYS,
]

export const SECRET_SETTING_KEYS: readonly string[] = [
  ...new Set([
    ...KEY_MAPS.flatMap((map) =>
      Object.entries(map)
        .filter(([name, value]) => SECRET_NAME.test(name) || SECRET_SUFFIX.test(value))
        .map(([, value]) => value)
    ),
    ...NAMED_SECRETS,
  ]),
].sort()

const SECRET_SET = new Set(SECRET_SETTING_KEYS)

export function isSecretSettingKey(key: string): boolean {
  return SECRET_SET.has(key) || SECRET_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export function isRedacted(value: unknown): boolean {
  return value === REDACTED
}

export function redactSettingRow<T extends { key: string; value: string }>(row: T): T {
  return isSecretSettingKey(row.key) ? { ...row, value: REDACTED } : row
}

export function redactWebhookRow<T extends { secret: string }>(row: T): T {
  return { ...row, secret: REDACTED }
}

/**
 * Settings rows from a backup with every redacted value replaced by what the
 * install has now. A redacted key the install has no value for is dropped.
 *
 * A "Data only" backup says nothing about the secrets it left out. Every
 * secret the install holds that such a file does not carry at all (one
 * entered after the backup was taken) is kept too: `installed` is the
 * install's settings rows, and each secret among them is appended as it
 * stands. Every key kept or dropped this way is listed in `redacted`.
 *
 * Whether the file is "Data only" is `options.dataOnly`, which the caller
 * reads from the file's header. Without it (a file from before the header
 * said so) a file with at least one marker counts as "Data only". A file
 * that is not carries its secrets in full and is restored as written.
 */
export function keepCurrentSecrets<T extends { key: string; value: unknown }>(
  rows: readonly T[],
  current: ReadonlyMap<string, string>,
  installed: readonly T[] = [],
  options: { dataOnly?: boolean } = {}
): { rows: T[]; redacted: string[] } {
  const kept: T[] = []
  const redacted: string[] = []
  for (const row of rows) {
    if (!isRedacted(row.value)) {
      kept.push(row)
      continue
    }
    redacted.push(row.key)
    const value = current.get(row.key)
    if (value !== undefined) kept.push({ ...row, value })
  }
  const dataOnly = options.dataOnly ?? redacted.length > 0
  if (dataOnly) {
    const inFile = new Set(rows.map((row) => row.key))
    for (const row of installed) {
      if (!isSecretSettingKey(row.key) || inFile.has(row.key)) continue
      inFile.add(row.key)
      kept.push(row)
      redacted.push(row.key)
    }
  }
  return { rows: kept, redacted: [...new Set(redacted)].sort() }
}

/**
 * Webhook rows from a backup with every redacted secret replaced: the current
 * secret of the same webhook (by id, then by URL), or a fresh one.
 */
export function keepCurrentWebhookSecrets<
  T extends { id?: unknown; url?: unknown; secret?: unknown },
>(
  rows: readonly T[],
  current: readonly { id: string; url: string; secret: string }[],
  mint: () => string
): { rows: T[]; minted: string[] } {
  const byId = new Map(current.map((w) => [w.id, w.secret]))
  const byUrl = new Map(current.map((w) => [w.url, w.secret]))
  const minted: string[] = []
  const out = rows.map((row) => {
    if (!isRedacted(row.secret)) return row
    const secret =
      (typeof row.id === 'string' ? byId.get(row.id) : undefined) ??
      (typeof row.url === 'string' ? byUrl.get(row.url) : undefined)
    if (secret !== undefined) return { ...row, secret }
    if (typeof row.id === 'string') minted.push(row.id)
    return { ...row, secret: mint() }
  })
  return { rows: out, minted }
}
