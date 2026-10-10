/**
 * What a settings save actually changed, in words.
 *
 * The form sends every field on every save, so "which keys were sent" says
 * nothing: it is the whole form each time. This compares what was in effect
 * with what is now, and names each setting that moved by its label and its
 * old and new value, the way the page shows them. The log is written in
 * English like every other line in it.
 */

import enIntegrations from '../../../../messages/en/integrations.json'
import type { ConnectorManifest, SettingField } from './types'

type Labels = Record<string, string>

function labelsOf(connectorId: string): Labels {
  const connectors = enIntegrations.connectors as Record<string, { settings?: Labels }>
  return connectors[connectorId]?.settings ?? {}
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function shown(field: SettingField, value: unknown, labels: Labels): string {
  if (field.type === 'boolean') return value === true ? 'on' : 'off'
  if (isEmpty(value)) return 'empty'
  if (field.type === 'select') {
    const option = field.options?.find((o) => o.value === String(value))
    return option ? (labels[option.label] ?? option.label) : String(value)
  }
  return String(value)
}

function same(field: SettingField, a: unknown, b: unknown): boolean {
  if (field.type === 'boolean') return (a === true) === (b === true)
  if (isEmpty(a) && isEmpty(b)) return true
  return String(a) === String(b)
}

/**
 * One line per setting whose value changed, such as
 * "Send issued invoices to Fiken: off → on". Empty when the save changed
 * nothing. `before` is what was in effect, defaults included, so a first
 * save does not report every default as a change.
 */
export function describeSettingChanges(
  manifest: ConnectorManifest,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const labels = labelsOf(manifest.id)
  const lines: string[] = []
  for (const field of manifest.settings) {
    if (!(field.key in after)) continue
    if (same(field, before[field.key], after[field.key])) continue
    const name = labels[field.label] ?? field.key
    lines.push(
      `${name}: ${shown(field, before[field.key], labels)} → ${shown(field, after[field.key], labels)}`
    )
  }
  return lines
}
