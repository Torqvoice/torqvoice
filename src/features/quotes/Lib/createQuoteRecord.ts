import 'server-only'

import { db } from '@/lib/db'
import {
  isShopFeeLine,
  newShopFeeLine,
  readShopFee,
  SHOP_FEE_SETTING_KEYS,
  shopFeeFor,
} from '@/features/settings/Lib/shopFee'
import {
  documentTotals,
  readWorkshopTax,
  taxFieldsForNewDocument,
  WORKSHOP_TAX_SETTING_KEYS,
} from '@/features/settings/Lib/workshopTax'
import {
  readWarrantyDefaults,
  WARRANTY_SETTING_KEYS,
  warrantyFieldsForNewDocument,
} from '@/features/settings/Lib/warrantyDefaults'
import { normalizeWarranty } from '@/lib/warranty'
import { resolveInvoicePrefix } from '@/lib/invoice-utils'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { toSafeWorkshopDate } from '@/lib/workshop-datetime'
import type { CreateQuoteInput } from '../Schema/quoteSchema'

export function defaultValidUntil(validDaysSetting: string | undefined): Date | undefined {
  const days = validDaysSetting === undefined ? 30 : Number.parseInt(validDaysSetting, 10)
  if (!Number.isFinite(days) || days <= 0) return undefined
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

/**
 * Writes a new quote for the workshop: numbered from its prefix, taxed at its
 * rate unless the customer is exempt, under its standing warranty unless the
 * caller says otherwise, with its parts and labour.
 *
 * The one place a quote is created, whether from the quote form or from an
 * inspection. The action wrapping either checks who is asking; this checks
 * that everything the quote points at is the workshop's own.
 */
export async function createQuoteRecord(
  { organizationId, userId }: { organizationId: string; userId: string },
  data: CreateQuoteInput
) {
  const settings = await db.appSetting.findMany({
    where: {
      organizationId,
      key: {
        in: [
          'workshop.quotePrefix',
          'workshop.quoteValidDays',
          ...WORKSHOP_TAX_SETTING_KEYS,
          ...WARRANTY_SETTING_KEYS,
          ...SHOP_FEE_SETTING_KEYS,
        ],
      },
    },
  })
  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value
  const prefix = resolveInvoicePrefix(settingsMap['workshop.quotePrefix'] ?? 'QT-')

  // A quote raised from an inspection carries the inspection's id, so the
  // quote page can link back. It has to be this workshop's: the id arrives
  // from the page, and a stranger's id would put their link on our quote.
  if (data.inspectionId) {
    const inspection = await db.inspection.findFirst({
      where: { id: data.inspectionId, organizationId },
      select: { id: true },
    })
    if (!inspection) throw new Error('Inspection not found')
  }

  // The workshop's shop fee, priced for the lines the quote starts with. A
  // caller that already carries one (a copied quote) keeps its own. Most
  // quotes start empty, so a percentage fee starts at nothing; the line is
  // written all the same, as on a work order, and the editor re-prices it as
  // lines are added. Without the line there is nothing to re-price.
  let feeAdded = false
  const shopFee = shopFeeFor(readShopFee(settingsMap), 'quote')
  if (shopFee && !(data.laborItems ?? []).some(isShopFeeLine)) {
    const labor = (data.laborItems ?? []).reduce((sum, l) => (l.excluded ? sum : sum + l.total), 0)
    const parts = (data.partItems ?? []).reduce((sum, p) => sum + p.total, 0)
    const feeLine = newShopFeeLine(shopFee, { labor, parts })
    data.laborItems = [...(data.laborItems ?? []), { ...feeLine, excluded: false }]
    if (feeLine.total > 0) {
      data.subtotal += feeLine.total
      if (data.discountType === 'percentage') {
        data.discountAmount = data.subtotal * (data.discountValue / 100)
      }
      feeAdded = true
    }
  }

  // Apply default tax rate from settings when the caller hasn't set one.
  // All current call sites send taxRate: 0 at creation, so 0 means "unset".
  const workshopTax = readWorkshopTax(settingsMap)
  let defaultTaxRate = workshopTax.rate
  const taxInclusive = workshopTax.inclusive

  // Tax-exempt customer: force the rate to 0 regardless of org default.
  let customerExempt = false
  if (data.customerId) {
    const customer = await db.customer.findFirst({
      where: { id: data.customerId, organizationId },
      select: { taxExempt: true },
    })
    if (customer?.taxExempt) {
      customerExempt = true
      defaultTaxRate = 0
      data.taxRate = 0
      data.taxAmount = 0
    }
  }

  // A quote at the workshop's own rate carries its tax components, so a
  // split-tax workshop's quote prints GST and QST apart from the start.
  // A rate the caller set by hand is one figure and stays one.
  const taxRate = data.taxRate > 0 ? data.taxRate : defaultTaxRate
  // The fee moved the subtotal, so the caller's tax and total are recomputed.
  if (feeAdded) {
    const totals = documentTotals({
      subtotal: data.subtotal,
      discountAmount: data.discountAmount,
      taxRate,
      taxInclusive,
      taxComponents: null,
    })
    data.taxAmount = totals.taxAmount
    data.totalAmount = totals.totalAmount
  }
  const splitTax =
    taxRate > 0 && taxRate === workshopTax.rate && !customerExempt
      ? documentTotals({
          subtotal: data.subtotal,
          discountAmount: data.discountAmount,
          taxRate,
          taxInclusive,
          taxComponents: taxFieldsForNewDocument(workshopTax).taxComponents,
        })
      : null

  const lastQuote = await db.quote.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { quoteNumber: true },
  })
  let nextNum = 1001
  if (lastQuote?.quoteNumber) {
    const match = lastQuote.quoteNumber.match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  const quoteNumber = `${prefix}${nextNum}`

  const {
    partItems,
    laborItems,
    warrantyStatus,
    warrantyMonths,
    warrantyMileage,
    warrantyNotes,
    ...quoteData
  } = data

  // A quote that says nothing about warranty starts from the workshop's
  // standing answer; one that says anything is taken at its word.
  const warrantyUnstated =
    warrantyStatus === undefined &&
    warrantyMonths === undefined &&
    warrantyMileage === undefined &&
    warrantyNotes === undefined
  const warranty = warrantyUnstated
    ? warrantyFieldsForNewDocument(readWarrantyDefaults(settingsMap), 'quote')
    : normalizeWarranty({ warrantyStatus, warrantyMonths, warrantyMileage, warrantyNotes })

  return db.$transaction(async (tx) => {
    const created = await tx.quote.create({
      data: {
        ...quoteData,
        ...warranty,
        quoteNumber,
        userId,
        organizationId,
        taxRate,
        taxInclusive,
        ...(splitTax?.taxComponents
          ? {
              taxComponents: splitTax.taxComponents,
              taxAmount: splitTax.taxAmount,
              totalAmount: splitTax.totalAmount,
            }
          : {}),
        validUntil:
          toSafeWorkshopDate(quoteData.validUntil, await workshopTimeZone(organizationId)) ??
          defaultValidUntil(settingsMap['workshop.quoteValidDays']),
        discountType: quoteData.discountType === 'none' ? null : quoteData.discountType,
      },
    })

    if (partItems && partItems.length > 0) {
      await tx.quotePart.createMany({
        data: partItems.map((p) => ({ ...p, quoteId: created.id })),
      })
    }

    if (laborItems && laborItems.length > 0) {
      await tx.quoteLabor.createMany({
        data: laborItems.map((l) => ({ ...l, quoteId: created.id })),
      })
    }

    return created
  })
}
