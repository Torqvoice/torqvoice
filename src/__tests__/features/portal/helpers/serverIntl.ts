/**
 * `next-intl/server` for a test of a portal server component: the English
 * messages, formatted the way next-intl does (plurals included), in "en".
 *
 *   vi.mock('next-intl/server', async () => (await import('./helpers/serverIntl')).serverIntl)
 */
import fs from 'node:fs'
import path from 'node:path'
import { IntlMessageFormat } from 'intl-messageformat'

function messagesAt(namespace: string): unknown {
  const [file, ...rest] = namespace.split('.')
  let node: unknown = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), `messages/en/${file}.json`), 'utf-8')
  )
  for (const segment of rest) node = (node as Record<string, unknown> | undefined)?.[segment]
  return node
}

export function englishTranslator(namespace: string) {
  const messages = messagesAt(namespace)
  return (key: string, values?: Record<string, unknown>) => {
    let template: unknown = messages
    for (const segment of key.split('.')) {
      template = (template as Record<string, unknown> | undefined)?.[segment]
    }
    // A missing key shows as its own name, which no assertion on English matches.
    if (typeof template !== 'string') return key
    return String(new IntlMessageFormat(template, 'en').format(values as Record<string, never>))
  }
}

export const serverIntl = {
  getTranslations: async (namespace: string) => englishTranslator(namespace),
  getLocale: async () => 'en',
}
