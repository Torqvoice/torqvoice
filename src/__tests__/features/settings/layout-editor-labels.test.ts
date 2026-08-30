/**
 * Every section and field the layout editor can list needs a name in every
 * locale. A missing one used to take the editor down: next-intl raises on a key
 * it cannot resolve, and the editor's fallback to the built-in English name
 * never ran because it was written expecting the key back instead.
 *
 * `warranty` had been missing in all twelve locales for exactly that reason,
 * unnoticed until someone opened the editor on a layout that had it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  BUILTIN_SECTIONS,
  BUILTIN_CUSTOMER_FIELDS,
  BUILTIN_VEHICLE_FIELDS,
  BUILTIN_SERVICE_FIELDS,
  BUILTIN_HEADER_FIELDS,
  BUILTIN_BANK_ACCOUNT_FIELDS,
  BUILTIN_FOOTER_FIELDS,
} from '@/features/settings/Schema/invoiceLayoutSchema'

const LOCALES = readdirSync('messages')

const FIELD_IDS = [
  ...BUILTIN_CUSTOMER_FIELDS,
  ...BUILTIN_VEHICLE_FIELDS,
  ...BUILTIN_SERVICE_FIELDS,
  ...BUILTIN_HEADER_FIELDS,
  ...BUILTIN_BANK_ACCOUNT_FIELDS,
  ...BUILTIN_FOOTER_FIELDS,
].map((f) => f.id)

function layoutEditorMessages(locale: string) {
  const json = JSON.parse(readFileSync(`messages/${locale}/settings.json`, 'utf8'))
  return json.layoutEditor ?? {}
}

describe('layout editor labels', () => {
  it('has at least the twelve shipped locales to check', () => {
    expect(LOCALES.length).toBeGreaterThanOrEqual(12)
  })

  it.each(LOCALES)('names every section in %s', (locale) => {
    const named = Object.keys(layoutEditorMessages(locale).sections ?? {})
    const missing = BUILTIN_SECTIONS.map((s) => s.id).filter((id) => !named.includes(id))
    expect(missing).toEqual([])
  })

  it.each(LOCALES)('names every field in %s', (locale) => {
    const named = Object.keys(layoutEditorMessages(locale).fields ?? {})
    const missing = FIELD_IDS.filter((id) => !named.includes(id))
    expect(missing).toEqual([])
  })
})
