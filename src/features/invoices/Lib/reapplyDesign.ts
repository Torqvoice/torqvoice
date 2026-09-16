/**
 * Re-freezing the look of an invoice that is already issued.
 *
 * An issued invoice prints from the snapshots it was issued with, so the
 * sheet a customer holds cannot be rewritten by a later change of address,
 * terms or logo. That is the point of issuing, and it is right for what the
 * document says. It is not always right for how it looks: a workshop that
 * rebrands, fixes a crooked logo or corrects a colour usually wants the new
 * look on the whole archive, not only on invoices sent from today.
 *
 * So this moves the two pointers that hold the look, `issuedDesignSnapshotId`
 * and `issuedLogoSnapshotId`, to a chosen design, or to the one the invoice
 * would print with if it were drafted now. Everything else an issue captured is left exactly as
 * it was: `issuedData` keeps the workshop and customer details, the payment
 * terms, the findings and the custom fields, and `issuedAt` keeps saying when
 * the document became the customer's. The numbers on the paper do not move.
 *
 * The old snapshot rows are not deleted. They are shared by content hash and
 * an invoice may still reference them, and keeping them costs a row. What
 * cannot be recovered is which snapshot this invoice used to point at, which
 * is why both callers warn before they run.
 */

import { db } from '@/lib/db'
import {
  ensureAssetSnapshot,
  ensureDesignSnapshot,
} from '@/features/invoice-designer/Lib/designSnapshots'
import { contentHash } from '@/features/invoice-designer/Lib/designHash'
import {
  designSourceFromStored,
  materializeDesignSource,
} from '@/features/invoice-designer/Lib/designSource'
import { currentLook, designLook, type DesignLook } from './assembleInvoicePrint'
import type { DesignSource } from '@/features/invoice-designer/Lib/designSource'

/** Only invoices that were issued have a look to re-apply; drafts follow the
 *  live design already. */
export const ISSUED_WHERE = (organizationId: string) => ({
  organizationId,
  issuedAt: { not: null },
})

const RECORD_SELECT = {
  id: true,
  designId: true,
  vehicleId: true,
  customer: { select: { invoiceDesignId: true } },
  vehicle: { select: { customer: { select: { invoiceDesignId: true } } } },
} as const

type DesignRecord = {
  id: string
  designId: string | null
  vehicleId: string | null
  customer: { invoiceDesignId: string | null } | null
  vehicle: { customer: { invoiceDesignId: string | null } | null } | null
}

/**
 * Two invoices resolve to the same design whenever these three agree, so a
 * run over a thousand invoices of one workshop does the resolution a handful
 * of times rather than a thousand.
 */
function lookKey(record: DesignRecord, customerDesignId: string | null): string {
  return [record.designId ?? '', customerDesignId ?? '', record.vehicleId ? 'v' : '-'].join('|')
}

interface Snapshots {
  designSnapshotId: string
  logoSnapshotId: string | null
}

async function snapshotsFor(organizationId: string, look: DesignLook): Promise<Snapshots> {
  const [designSnapshotId, logoSnapshotId] = await Promise.all([
    ensureDesignSnapshot(organizationId, look.designSource),
    look.logoDataUri
      ? ensureAssetSnapshot(organizationId, look.logoDataUri)
      : Promise.resolve(null),
  ])
  return { designSnapshotId, logoSnapshotId }
}

/**
 * Points the given issued invoices at a design. `chosenDesignId` names one of
 * the workshop's saved designs; null means whichever design each invoice
 * would follow if it were drafted now, which is what the archive run uses.
 *
 * Returns how many rows were changed. Records that are not issued are skipped
 * rather than issued as a side effect: freezing a draft is a different
 * decision, and invoice settings already offers it.
 */
export async function reapplyDesign(
  organizationId: string,
  recordIds: string[],
  chosenDesignId: string | null = null
): Promise<number> {
  if (recordIds.length === 0) return 0

  const [records, settings] = await Promise.all([
    db.serviceRecord.findMany({
      where: { ...ISSUED_WHERE(organizationId), id: { in: recordIds } },
      select: RECORD_SELECT,
    }),
    db.appSetting.findMany({ where: { organizationId }, select: { key: true, value: true } }),
  ])
  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  // One named design is the same look for every invoice, so it is resolved
  // once. Following the default is resolved per invoice, but two invoices
  // that agree on the three things the rules read share the answer.
  const chosen = chosenDesignId
    ? await snapshotsFor(
        organizationId,
        await designLook(settingsMap, await loadDesignSource(organizationId, chosenDesignId))
      )
    : null
  const resolved = new Map<string, Snapshots>()
  let updated = 0

  for (const record of records) {
    let snapshots = chosen
    if (!snapshots) {
      const customerDesignId =
        record.customer?.invoiceDesignId ?? record.vehicle?.customer?.invoiceDesignId ?? null
      const key = lookKey(record, customerDesignId)
      snapshots = resolved.get(key) ?? null
      if (!snapshots) {
        snapshots = await snapshotsFor(
          organizationId,
          await currentLook(organizationId, settingsMap, record, customerDesignId)
        )
        resolved.set(key, snapshots)
      }
    }
    await db.serviceRecord.update({
      where: { id: record.id },
      data: {
        issuedDesignSnapshotId: snapshots.designSnapshotId,
        issuedLogoSnapshotId: snapshots.logoSnapshotId,
      },
    })
    updated += 1
  }

  return updated
}

/** A saved invoice design of this workshop, refused if it is neither. */
async function loadDesignSource(organizationId: string, designId: string) {
  const row = await db.documentDesign.findFirst({
    where: { id: designId, organizationId, documentType: 'invoice' },
    select: { layout: true, template: true },
  })
  const source = row ? designSourceFromStored(row.layout, row.template) : null
  if (!source) throw new Error('Design not found')
  return source
}

/**
 * Which design an issued invoice prints with, worked out by content rather
 * than stored. Nothing on the record names the frozen design: snapshots are
 * shared by content hash and carry no name, so the only honest answer is to
 * hash each saved design and see which one matches.
 *
 * That also answers it correctly after the design has been edited since the
 * invoice was sent, where the truthful answer is "none of these any more".
 * Worked out when the menu opens rather than on every page load, because it
 * reads every design of the workshop to do it.
 */
export async function issuedDesignState(organizationId: string, recordId: string) {
  const record = await db.serviceRecord.findFirst({
    where: { id: recordId, organizationId },
    select: {
      ...RECORD_SELECT,
      issuedAt: true,
      issuedDesignSnapshot: { select: { hash: true } },
    },
  })
  if (!record?.issuedAt) return null

  const [designs, settings] = await Promise.all([
    db.documentDesign.findMany({
      where: { organizationId, documentType: 'invoice' },
      select: { id: true, name: true, layout: true, template: true },
      orderBy: { name: 'asc' },
    }),
    db.appSetting.findMany({ where: { organizationId }, select: { key: true, value: true } }),
  ])
  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  const frozenHash = record.issuedDesignSnapshot?.hash ?? null
  const hashOf = (source: DesignSource | null) =>
    source ? contentHash(materializeDesignSource(source)) : null

  const customerDesignId =
    record.customer?.invoiceDesignId ?? record.vehicle?.customer?.invoiceDesignId ?? null
  const live = await currentLook(organizationId, settingsMap, record, customerDesignId)
  const followsDefault = frozenHash !== null && hashOf(live.designSource) === frozenHash

  // The default wins a tie: when it resolves to a named design, "follows the
  // default" says more about the invoice than the design's own name does.
  const matchedDesignId = followsDefault
    ? null
    : (designs.find((d) => hashOf(designSourceFromStored(d.layout, d.template)) === frozenHash)
        ?.id ?? null)

  return {
    issuedAt: record.issuedAt.toISOString(),
    followsDefault,
    matchedDesignId,
    /** True when the frozen look is no design the workshop still has. */
    unknown: !followsDefault && matchedDesignId === null,
    designs: designs.map((d) => ({ id: d.id, name: d.name })),
  }
}
