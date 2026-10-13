'use server'

import { taxModeConversion } from '@/lib/tax-mode-conversion'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { SETTING_KEYS } from '../Schema/settingsSchema'
import {
  documentTotals,
  readWorkshopTax,
  taxFieldsForNewDocument,
  WORKSHOP_TAX_SETTING_KEYS,
} from '../Lib/workshopTax'
import { getDocumentLockSettings } from '@/lib/document-lock.server'
import { invoiceLockState, quoteLockState } from '@/lib/document-lock'

/**
 * Apply the current default tax rate from settings to existing ServiceRecords
 * and Quotes whose taxRate is still 0 (i.e. created before the default was set
 * or before the taxRate-on-creation fix). Recalculates taxAmount and
 * totalAmount for each updated record.
 *
 * Records with an explicit taxRate > 0 are left untouched so individual
 * overrides are never clobbered.
 */
export async function applyTaxRateToExisting() {
  return withAuth(
    async ({ organizationId }) => {
      // Read current tax settings
      const settings = await db.appSetting.findMany({
        where: {
          organizationId,
          key: { in: [...WORKSHOP_TAX_SETTING_KEYS] },
        },
      })
      const settingsMap: Record<string, string> = {}
      for (const s of settings) settingsMap[s.key] = s.value

      const workshopTax = readWorkshopTax(settingsMap)
      const taxEnabled = workshopTax.enabled
      const defaultTaxRate = Number(settingsMap[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0
      // The split, when the workshop has one, goes onto each record with the
      // rate, so a backfilled invoice prints the same lines as a new one.
      const defaultComponents = taxFieldsForNewDocument(workshopTax).taxComponents

      if (!taxEnabled || defaultTaxRate <= 0) {
        throw new Error('Tax must be enabled and the default tax rate must be greater than 0.')
      }

      // --- Service records (work orders / invoices) ---
      const allServiceRecords = await db.serviceRecord.findMany({
        where: {
          organizationId,
          taxRate: 0,
        },
        select: {
          id: true,
          subtotal: true,
          taxableSubtotal: true,
          discountAmount: true,
          taxInclusive: true,
          sentAt: true,
          manuallyPaid: true,
          totalAmount: true,
          cost: true,
          editUnlockedAt: true,
          payments: { select: { amount: true } },
        },
      })

      // --- Quotes ---
      const allQuotes = await db.quote.findMany({
        where: {
          organizationId,
          taxRate: 0,
        },
        select: {
          id: true,
          subtotal: true,
          taxableSubtotal: true,
          discountAmount: true,
          taxInclusive: true,
          status: true,
          sentAt: true,
          editUnlockedAt: true,
        },
      })

      // A locked document is exactly the one whose total must not change
      // under it, so the sweep steps around it. Anything skipped stays
      // eligible: unlock it (or turn locking off) and run the backfill again.
      const lockSettings = await getDocumentLockSettings(organizationId)
      const serviceRecords = allServiceRecords.filter(
        (r) => !invoiceLockState(r, lockSettings).locked
      )
      const quotes = allQuotes.filter((q) => !quoteLockState(q, lockSettings).locked)
      const serviceRecordsSkipped = allServiceRecords.length - serviceRecords.length
      const quotesSkipped = allQuotes.length - quotes.length

      let serviceRecordsUpdated = 0
      let quotesUpdated = 0

      await db.$transaction(async (tx) => {
        for (const r of serviceRecords) {
          const { taxAmount, totalAmount, taxComponents } = documentTotals({
            subtotal: r.subtotal,
            discountAmount: r.discountAmount,
            taxRate: defaultTaxRate,
            taxInclusive: r.taxInclusive,
            taxComponents: defaultComponents,
            // Which lines are taxed is already on the document; only the rate is new.
            taxableSubtotal: r.taxableSubtotal,
          })
          await tx.serviceRecord.update({
            where: { id: r.id },
            data: {
              taxRate: defaultTaxRate,
              taxAmount,
              totalAmount,
              taxComponents,
            },
          })
          serviceRecordsUpdated++
        }

        for (const q of quotes) {
          const { taxAmount, totalAmount, taxComponents } = documentTotals({
            subtotal: q.subtotal,
            discountAmount: q.discountAmount,
            taxRate: defaultTaxRate,
            taxInclusive: q.taxInclusive,
            taxComponents: defaultComponents,
            // Which lines are taxed is already on the document; only the rate is new.
            taxableSubtotal: q.taxableSubtotal,
          })
          await tx.quote.update({
            where: { id: q.id },
            data: {
              taxRate: defaultTaxRate,
              taxAmount,
              totalAmount,
              taxComponents,
            },
          })
          quotesUpdated++
        }
      })

      revalidatePath('/work-orders')
      revalidatePath('/quotes')
      revalidatePath('/vehicles')

      return {
        serviceRecordsUpdated,
        quotesUpdated,
        serviceRecordsSkipped,
        quotesSkipped,
        taxRate: defaultTaxRate,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'settings.applyTaxRate',
        entity: 'Organization',
        details: {
          key: 'settings_applyTaxRate',
          params: {
            rate: result.taxRate,
            records: result.serviceRecordsUpdated,
            quotes: result.quotesUpdated,
          },
        },
        metadata: {
          taxRate: result.taxRate,
          serviceRecordsUpdated: result.serviceRecordsUpdated,
          quotesUpdated: result.quotesUpdated,
          serviceRecordsSkippedLocked: result.serviceRecordsSkipped,
          quotesSkippedLocked: result.quotesSkipped,
        },
      }),
    }
  )
}

/**
 * Count existing records eligible for the tax backfill (taxRate = 0).
 * Used so the UI can show how many records the button will affect.
 */
export async function getTaxBackfillCounts() {
  return withAuth(
    async ({ organizationId }) => {
      const [serviceRecords, quotes] = await Promise.all([
        db.serviceRecord.count({
          where: { organizationId, taxRate: 0 },
        }),
        db.quote.count({
          where: { organizationId, taxRate: 0 },
        }),
      ])
      return { serviceRecords, quotes }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

/**
 * Count existing exclusive-mode records that can be converted to inclusive.
 */
export async function getInclusiveBackfillCounts() {
  return withAuth(
    async ({ organizationId }) => {
      const [serviceRecords, quotes] = await Promise.all([
        db.serviceRecord.count({
          where: { organizationId, taxInclusive: false },
        }),
        db.quote.count({
          where: { organizationId, taxInclusive: false },
        }),
      ])
      return { serviceRecords, quotes }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

/**
 * Count existing inclusive-mode records that can be converted back to exclusive.
 */
export async function getExclusiveBackfillCounts() {
  return withAuth(
    async ({ organizationId }) => {
      const [serviceRecords, quotes] = await Promise.all([
        db.serviceRecord.count({
          where: { organizationId, taxInclusive: true },
        }),
        db.quote.count({
          where: { organizationId, taxInclusive: true },
        }),
      ])
      return { serviceRecords, quotes }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

/**
 * Convert existing exclusive-tax ServiceRecords and Quotes to inclusive mode.
 *
 * Behaviour: scale every line item price upward by `(1 + taxRate / 100)` so
 * the gross customer-facing total stays IDENTICAL after the conversion. The
 * record's `taxInclusive` flag is set to true; `taxAmount` and `totalAmount`
 * are recomputed via the helper (and should match what was stored before).
 *
 * - Records with `taxInclusive = true` are skipped.
 * - Records with `taxRate = 0` are flag-flipped only (no math needed).
 * - Percentage discounts keep their percent value; the resulting
 *   `discountAmount` scales naturally with the bigger subtotal.
 * - Fixed discounts have their `discountValue` AND `discountAmount` scaled,
 *   so the customer still gets the same effective discount.
 *
 * This is irreversible from a data-shape perspective: the line item prices
 * shown on past invoices will change to display gross prices, even though
 * the customer paid the same total.
 */
export async function convertRecordsToInclusive() {
  return withAuth(
    async ({ organizationId }) => {
      // --- Service records ---
      const serviceRecords = await db.serviceRecord.findMany({
        where: {
          organizationId,
          taxInclusive: false,
        },
        select: {
          id: true,
          subtotal: true,
          taxableSubtotal: true,
          discountType: true,
          discountValue: true,
          discountAmount: true,
          taxRate: true,
          taxComponents: true,
          partItems: { select: { id: true, unitPrice: true, total: true, taxable: true } },
          laborItems: { select: { id: true, rate: true, total: true, taxable: true } },
        },
      })

      // --- Quotes ---
      const quotes = await db.quote.findMany({
        where: {
          organizationId,
          taxInclusive: false,
        },
        select: {
          id: true,
          subtotal: true,
          taxableSubtotal: true,
          discountType: true,
          discountValue: true,
          discountAmount: true,
          taxRate: true,
          taxComponents: true,
          partItems: { select: { id: true, unitPrice: true, total: true, taxable: true } },
          laborItems: { select: { id: true, rate: true, total: true, taxable: true } },
        },
      })

      let serviceRecordsUpdated = 0
      let quotesUpdated = 0

      await db.$transaction(async (tx) => {
        for (const r of serviceRecords) {
          // Only the taxable lines hold tax, so only they are re-priced.
          const moved = taxModeConversion(r, 'inclusive')

          const { taxAmount, totalAmount, taxComponents, taxableSubtotal } = documentTotals({
            subtotal: moved.subtotal,
            discountAmount: moved.discountAmount,
            taxRate: r.taxRate,
            taxInclusive: true,
            taxComponents: r.taxComponents,
            taxableSubtotal: moved.taxableSubtotal,
          })

          if (r.taxRate > 0) {
            for (const p of r.partItems) {
              if (!p.taxable) continue
              await tx.servicePart.update({
                where: { id: p.id },
                data: {
                  unitPrice: moved.scaleLine(p.unitPrice),
                  total: moved.scaleLine(p.total),
                },
              })
            }
            for (const l of r.laborItems) {
              if (!l.taxable) continue
              await tx.serviceLabor.update({
                where: { id: l.id },
                data: { rate: moved.scaleLine(l.rate), total: moved.scaleLine(l.total) },
              })
            }
          }

          await tx.serviceRecord.update({
            where: { id: r.id },
            data: {
              taxInclusive: true,
              subtotal: moved.subtotal,
              discountValue: moved.discountValue,
              discountAmount: moved.discountAmount,
              taxAmount,
              totalAmount,
              taxComponents,
              taxableSubtotal,
            },
          })
          serviceRecordsUpdated++
        }

        for (const q of quotes) {
          // Only the taxable lines hold tax, so only they are re-priced.
          const moved = taxModeConversion(q, 'inclusive')

          const { taxAmount, totalAmount, taxComponents, taxableSubtotal } = documentTotals({
            subtotal: moved.subtotal,
            discountAmount: moved.discountAmount,
            taxRate: q.taxRate,
            taxInclusive: true,
            taxComponents: q.taxComponents,
            taxableSubtotal: moved.taxableSubtotal,
          })

          if (q.taxRate > 0) {
            for (const p of q.partItems) {
              if (!p.taxable) continue
              await tx.quotePart.update({
                where: { id: p.id },
                data: {
                  unitPrice: moved.scaleLine(p.unitPrice),
                  total: moved.scaleLine(p.total),
                },
              })
            }
            for (const l of q.laborItems) {
              if (!l.taxable) continue
              await tx.quoteLabor.update({
                where: { id: l.id },
                data: { rate: moved.scaleLine(l.rate), total: moved.scaleLine(l.total) },
              })
            }
          }

          await tx.quote.update({
            where: { id: q.id },
            data: {
              taxInclusive: true,
              subtotal: moved.subtotal,
              discountValue: moved.discountValue,
              discountAmount: moved.discountAmount,
              taxAmount,
              totalAmount,
              taxComponents,
              taxableSubtotal,
            },
          })
          quotesUpdated++
        }
      })

      revalidatePath('/work-orders')
      revalidatePath('/quotes')
      revalidatePath('/vehicles')

      return { serviceRecordsUpdated, quotesUpdated }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'settings.convertToInclusive',
        entity: 'Organization',
        details: {
          key: 'settings_convertToInclusive',
          params: { records: result.serviceRecordsUpdated, quotes: result.quotesUpdated },
        },
        metadata: result,
      }),
    }
  )
}

/**
 * Convert existing inclusive-tax ServiceRecords and Quotes back to exclusive
 * mode. Mirror of `convertRecordsToInclusive`.
 *
 * Behaviour: scale every line item price downward by `(1 + taxRate / 100)` so
 * the gross customer-facing total stays IDENTICAL after the conversion. The
 * record's `taxInclusive` flag is set to false; `taxAmount` and `totalAmount`
 * are recomputed via the helper.
 *
 * - Records with `taxInclusive = false` are skipped.
 * - Records with `taxRate = 0` are flag-flipped only (factor = 1).
 * - Percentage discounts keep their percent value; the resulting
 *   `discountAmount` scales naturally with the smaller subtotal.
 * - Fixed discounts have their `discountValue` AND `discountAmount` scaled,
 *   so the customer still gets the same effective discount.
 *
 * After conversion the printed line item prices on past invoices appear LOWER
 * because they now show the pre-tax amount. The customer paid the same total.
 */
export async function convertRecordsToExclusive() {
  return withAuth(
    async ({ organizationId }) => {
      const serviceRecords = await db.serviceRecord.findMany({
        where: {
          organizationId,
          taxInclusive: true,
        },
        select: {
          id: true,
          subtotal: true,
          taxableSubtotal: true,
          discountType: true,
          discountValue: true,
          discountAmount: true,
          taxRate: true,
          taxComponents: true,
          partItems: { select: { id: true, unitPrice: true, total: true, taxable: true } },
          laborItems: { select: { id: true, rate: true, total: true, taxable: true } },
        },
      })

      const quotes = await db.quote.findMany({
        where: {
          organizationId,
          taxInclusive: true,
        },
        select: {
          id: true,
          subtotal: true,
          taxableSubtotal: true,
          discountType: true,
          discountValue: true,
          discountAmount: true,
          taxRate: true,
          taxComponents: true,
          partItems: { select: { id: true, unitPrice: true, total: true, taxable: true } },
          laborItems: { select: { id: true, rate: true, total: true, taxable: true } },
        },
      })

      let serviceRecordsUpdated = 0
      let quotesUpdated = 0

      await db.$transaction(async (tx) => {
        for (const r of serviceRecords) {
          // Only the taxable lines hold tax, so only they are re-priced.
          const moved = taxModeConversion(r, 'exclusive')

          const { taxAmount, totalAmount, taxComponents, taxableSubtotal } = documentTotals({
            subtotal: moved.subtotal,
            discountAmount: moved.discountAmount,
            taxRate: r.taxRate,
            taxInclusive: false,
            taxComponents: r.taxComponents,
            taxableSubtotal: moved.taxableSubtotal,
          })

          if (r.taxRate > 0) {
            for (const p of r.partItems) {
              if (!p.taxable) continue
              await tx.servicePart.update({
                where: { id: p.id },
                data: {
                  unitPrice: moved.scaleLine(p.unitPrice),
                  total: moved.scaleLine(p.total),
                },
              })
            }
            for (const l of r.laborItems) {
              if (!l.taxable) continue
              await tx.serviceLabor.update({
                where: { id: l.id },
                data: { rate: moved.scaleLine(l.rate), total: moved.scaleLine(l.total) },
              })
            }
          }

          await tx.serviceRecord.update({
            where: { id: r.id },
            data: {
              taxInclusive: false,
              subtotal: moved.subtotal,
              discountValue: moved.discountValue,
              discountAmount: moved.discountAmount,
              taxAmount,
              totalAmount,
              taxComponents,
              taxableSubtotal,
            },
          })
          serviceRecordsUpdated++
        }

        for (const q of quotes) {
          // Only the taxable lines hold tax, so only they are re-priced.
          const moved = taxModeConversion(q, 'exclusive')

          const { taxAmount, totalAmount, taxComponents, taxableSubtotal } = documentTotals({
            subtotal: moved.subtotal,
            discountAmount: moved.discountAmount,
            taxRate: q.taxRate,
            taxInclusive: false,
            taxComponents: q.taxComponents,
            taxableSubtotal: moved.taxableSubtotal,
          })

          if (q.taxRate > 0) {
            for (const p of q.partItems) {
              if (!p.taxable) continue
              await tx.quotePart.update({
                where: { id: p.id },
                data: {
                  unitPrice: moved.scaleLine(p.unitPrice),
                  total: moved.scaleLine(p.total),
                },
              })
            }
            for (const l of q.laborItems) {
              if (!l.taxable) continue
              await tx.quoteLabor.update({
                where: { id: l.id },
                data: { rate: moved.scaleLine(l.rate), total: moved.scaleLine(l.total) },
              })
            }
          }

          await tx.quote.update({
            where: { id: q.id },
            data: {
              taxInclusive: false,
              subtotal: moved.subtotal,
              discountValue: moved.discountValue,
              discountAmount: moved.discountAmount,
              taxAmount,
              totalAmount,
              taxComponents,
              taxableSubtotal,
            },
          })
          quotesUpdated++
        }
      })

      revalidatePath('/work-orders')
      revalidatePath('/quotes')
      revalidatePath('/vehicles')

      return { serviceRecordsUpdated, quotesUpdated }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'settings.convertToExclusive',
        entity: 'Organization',
        details: {
          key: 'settings_convertToExclusive',
          params: { records: result.serviceRecordsUpdated, quotes: result.quotesUpdated },
        },
        metadata: result,
      }),
    }
  )
}
