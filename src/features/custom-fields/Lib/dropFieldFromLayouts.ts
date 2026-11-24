import type { TxClient } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { toCustomFieldId } from '@/features/settings/Schema/invoiceLayoutSchema'

/**
 * A layout as stored, with the one custom field taken out of every section.
 * Returns null when the field was in none of them, so the caller writes
 * nothing.
 *
 * Only the field goes. A section keeps the on/off the workshop gave it:
 * switching General off because its last custom field went would undo a
 * choice somebody may have made on purpose, and a General panel with
 * nothing to print prints nothing.
 *
 * Works on the stored JSON, not the merged config: what is saved is what
 * the workshop arranged, and merging defaults in here would write them back
 * as if somebody had chosen them.
 */
export function layoutWithoutField(stored: unknown, definitionId: string): unknown | null {
  if (!stored || typeof stored !== 'object') return null
  const layout = stored as { sections?: unknown }
  if (!Array.isArray(layout.sections)) return null
  const cfId = toCustomFieldId(definitionId)
  let changed = false
  const sections = layout.sections.map((section) => {
    const fields = (section as { fields?: unknown })?.fields
    if (!Array.isArray(fields)) return section
    const kept = fields.filter((f) => (f as { id?: unknown })?.id !== cfId)
    if (kept.length === fields.length) return section
    changed = true
    return { ...(section as object), fields: kept }
  })
  return changed ? { ...layout, sections } : null
}

/** The settings rows that hold a document's arrangement. */
const LAYOUT_KEYS = [
  SETTING_KEYS.INVOICE_LAYOUT_CONFIG,
  SETTING_KEYS.QUOTE_LAYOUT_CONFIG,
  SETTING_KEYS.WORK_ORDER_LAYOUT_CONFIG,
  SETTING_KEYS.CERTIFICATE_LAYOUT_CONFIG,
]

/**
 * Takes a deleted custom field out of every arrangement that still names it:
 * the document layouts in settings and the saved designs. Without this the
 * field stayed in the saved layout after the definition was gone, and the
 * designer listed a field that no longer existed.
 *
 * Designs frozen for an issued document (snapshots) are left as they are:
 * paper a customer already holds does not change.
 */
export async function dropFieldFromLayouts(
  tx: TxClient,
  organizationId: string,
  definitionId: string
): Promise<void> {
  const settings = await tx.appSetting.findMany({
    where: { organizationId, key: { in: LAYOUT_KEYS } },
    select: { id: true, value: true },
  })
  for (const row of settings) {
    let parsed: unknown
    try {
      parsed = JSON.parse(row.value)
    } catch {
      continue
    }
    const next = layoutWithoutField(parsed, definitionId)
    if (next) {
      await tx.appSetting.update({ where: { id: row.id }, data: { value: JSON.stringify(next) } })
    }
  }

  const designs = await tx.documentDesign.findMany({
    where: { organizationId },
    select: { id: true, layout: true },
  })
  for (const design of designs) {
    const next = layoutWithoutField(design.layout, definitionId)
    if (next) {
      await tx.documentDesign.update({
        where: { id: design.id },
        data: { layout: next as Prisma.InputJsonValue },
      })
    }
  }
}
