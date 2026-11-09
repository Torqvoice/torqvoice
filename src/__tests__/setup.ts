import '@testing-library/jest-dom'
import { vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { IntlMessageFormat } from 'intl-messageformat'

// ---------------------------------------------------------------------------
// Load all English translation files so the next-intl mock resolves keys to
// real English strings. This lets existing test assertions (e.g.
// getByText("Download PDF")) continue to work after the i18n migration.
// ---------------------------------------------------------------------------
const messagesDir = path.resolve(process.cwd(), 'messages/en')
const allMessages: Record<string, unknown> = {}

for (const file of fs.readdirSync(messagesDir)) {
  if (file.endsWith('.json')) {
    const ns = file.replace('.json', '')
    allMessages[ns] = JSON.parse(fs.readFileSync(path.join(messagesDir, file), 'utf-8'))
  }
}

/** Resolve a dot-separated key path inside a nested object. */
function resolve(obj: unknown, keyPath: string): string | undefined {
  let cur = obj
  for (const seg of keyPath.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return typeof cur === 'string' ? cur : undefined
}

/**
 * Formats a message the way next-intl does. Plural and select messages go
 * through ICU, so a test can assert "2 observations" rather than the raw
 * template; anything ICU refuses falls back to plain `{name}` replacement.
 */
function interpolate(tpl: string, values?: Record<string, unknown>): string {
  if (!values) return tpl
  if (/\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/.test(tpl)) {
    try {
      return String(new IntlMessageFormat(tpl, 'en').format(values as Record<string, never>))
    } catch {
      // Fall through to the plain replacement below.
    }
  }
  return Object.entries(values).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    tpl
  )
}

// Mock next-intl globally so components using useTranslations can render in tests.
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    // Namespace examples: "share.invoice", "auth.resetPassword", "common"
    const parts = namespace.split('.')
    const file = parts[0]
    const sub = parts.slice(1).join('.')

    // A namespace can reach any depth, such as "service.laborGuide.confidence".
    let messages: unknown = allMessages[file]
    for (const seg of sub ? sub.split('.') : []) {
      if (!messages || typeof messages !== 'object') break
      messages = (messages as Record<string, unknown>)[seg]
    }

    const t = (key: string, values?: Record<string, unknown>) => {
      const tpl = resolve(messages, key)
      if (tpl) return interpolate(tpl, values)
      // Fallback: return key (with values appended)
      if (values) return `${key} ${JSON.stringify(values)}`
      return key
    }
    t.raw = (key: string) => resolve(messages, key) ?? key
    t.rich = (key: string, values?: Record<string, unknown>) => {
      const tpl = resolve(messages, key)
      return tpl ? interpolate(tpl, values) : key
    }
    t.markup = (key: string) => resolve(messages, key) ?? key
    t.has = (key: string) => resolve(messages, key) !== undefined
    return t
  },
  useLocale: () => 'en',
  useFormatter: () => ({
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat('en', options).format(value),
    dateTime: (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en', options).format(value),
    // The largest whole unit, the way next-intl picks one: "32 minutes ago".
    relativeTime: (value: Date | number, now: Date | number = Date.now()) => {
      const seconds = Math.round((Number(value) - Number(now)) / 1000)
      const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['day', 86_400],
        ['hour', 3_600],
        ['minute', 60],
      ]
      for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
      }
      return rtf.format(seconds, 'second')
    },
  }),
  useMessages: () => ({}),
  useNow: () => new Date(),
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}))
