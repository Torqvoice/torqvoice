import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { resolveInvoicePrefix } from '@/lib/invoice-utils'
import { documentTotals } from '@/features/settings/Lib/workshopTax'
import { loadTaxApplies } from '@/features/settings/Lib/loadTaxApplies'
import { laborTaxable, type TaxApplies } from '@/lib/taxable-lines'
import { lineTotal } from '@/features/inventory/Lib/partPricing'
import { shiftWorkshopTime } from '@/lib/workshop-datetime'
import { workshopTimeZone } from '@/lib/workshop-timezone'

/**
 * One period on from `current`, at the same time on the workshop's clock.
 * Shared with the manual "run now" action so both paths agree.
 */
/**
 * The sum of a template's lines that the workshop taxes today, for the
 * invoice about to be generated from it. A template's lines carry no tax
 * choice of their own, so each follows the rule for its kind; a shop fee is
 * a labor row told apart by how it is priced, and has its own rule.
 */
export function recurringTaxableSubtotal(
  template: {
    cost: number
    templateParts: { quantity: number; unitPrice: number }[]
    templateLabor: { hours: number; rate: number; pricingType?: string | null }[]
  },
  applies: TaxApplies
): number {
  const parts = template.templateParts.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0)
  const labor = template.templateLabor.reduce(
    (sum, l) => (laborTaxable(l, applies) ? sum + l.hours * l.rate : sum),
    0
  )
  return template.cost + (applies.parts ? parts : 0) + labor
}

export function calculateNextRunDate(current: Date, frequency: string, timeZone: string): Date {
  switch (frequency) {
    case 'weekly':
      return shiftWorkshopTime(current, { days: 7 }, timeZone)
    case 'biweekly':
      return shiftWorkshopTime(current, { days: 14 }, timeZone)
    case 'monthly':
      return shiftWorkshopTime(current, { months: 1 }, timeZone)
    case 'quarterly':
      return shiftWorkshopTime(current, { months: 3 }, timeZone)
    case 'yearly':
      return shiftWorkshopTime(current, { years: 1 }, timeZone)
    default:
      return current
  }
}

async function generateInvoiceNumber(organizationId: string): Promise<string> {
  const settings = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: ['workshop.invoicePrefix', 'workshop.invoiceStartNumber'] },
    },
  })

  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  const prefix = resolveInvoicePrefix(settingsMap['workshop.invoicePrefix'] ?? '{year}-')
  const startNumber = parseInt(settingsMap['workshop.invoiceStartNumber'] || '0', 10)

  const lastRecord = await db.serviceRecord.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  })

  let nextNum = startNumber || 1001
  if (lastRecord?.invoiceNumber) {
    const match = lastRecord.invoiceNumber.match(/(\d+)$/)
    if (match) {
      const lastNum = parseInt(match[1], 10) + 1
      nextNum = Math.max(nextNum, lastNum)
    }
  }

  return `${prefix}${nextNum}`
}

/** Generates invoices from recurring templates every hour */
export function processRecurringInvoices() {
  const job = new CronJob('0 * * * *', async () => {
    try {
      const now = new Date()

      const dueInvoices = await db.recurringInvoice.findMany({
        where: { isActive: true, nextRunDate: { lte: now } },
        include: {
          templateParts: true,
          templateLabor: true,
          vehicle: { select: { organizationId: true } },
        },
      })

      let processed = 0
      // One settings read per workshop, however many of its invoices are due
      const zones = new Map<string, string>()
      const applies = new Map<string, TaxApplies>()

      for (const ri of dueInvoices) {
        const organizationId = ri.vehicle.organizationId
        if (!organizationId) continue

        try {
          let timeZone = zones.get(organizationId)
          if (!timeZone) {
            timeZone = await workshopTimeZone(organizationId)
            zones.set(organizationId, timeZone)
          }
          const invoiceNumber = await generateInvoiceNumber(organizationId)

          const partsSubtotal = ri.templateParts.reduce((s, p) => s + p.quantity * p.unitPrice, 0)
          const laborSubtotal = ri.templateLabor.reduce((s, l) => s + l.hours * l.rate, 0)
          const subtotal = ri.cost + partsSubtotal + laborSubtotal
          // A template's lines carry no tax choice of their own, so each
          // invoice it generates follows the workshop's rule on the day.
          let taxApplies = applies.get(organizationId)
          if (!taxApplies) {
            taxApplies = await loadTaxApplies(organizationId)
            applies.set(organizationId, taxApplies)
          }
          const { taxAmount, totalAmount, taxComponents, taxableSubtotal } = documentTotals({
            subtotal,
            discountAmount: 0,
            taxRate: ri.taxRate,
            taxInclusive: ri.taxInclusive,
            taxComponents: ri.taxComponents,
            taxableSubtotal: recurringTaxableSubtotal(ri, taxApplies),
          })
          const lineTax = taxApplies

          await db.$transaction(async (tx) => {
            await tx.serviceRecord.create({
              data: {
                organizationId,
                title: ri.title,
                description: ri.description,
                type: ri.type,
                status: 'completed',
                cost: ri.cost,
                serviceDate: now,
                startDateTime: now,
                invoiceNotes: ri.invoiceNotes,
                subtotal,
                taxRate: ri.taxRate,
                taxInclusive: ri.taxInclusive,
                taxComponents,
                taxableSubtotal,
                taxAmount,
                totalAmount,
                invoiceNumber,
                vehicleId: ri.vehicleId,
                partItems: {
                  create: ri.templateParts.map((p) => ({
                    name: p.name,
                    partNumber: p.partNumber,
                    quantity: p.quantity,
                    unitPrice: p.unitPrice,
                    total: lineTotal(p.quantity, p.unitPrice),
                    taxable: lineTax.parts,
                  })),
                },
                laborItems: {
                  create: ri.templateLabor.map((l) => ({
                    description: l.description,
                    hours: l.hours,
                    rate: l.rate,
                    total: l.hours * l.rate,
                    pricingType: l.pricingType || 'hourly',
                    taxable: laborTaxable(l, lineTax),
                  })),
                },
              },
            })

            const nextRunDate = calculateNextRunDate(ri.nextRunDate, ri.frequency, timeZone)
            const shouldDeactivate = ri.endDate && nextRunDate > ri.endDate

            await tx.recurringInvoice.update({
              where: { id: ri.id },
              data: {
                lastRunAt: now,
                runCount: { increment: 1 },
                nextRunDate,
                ...(shouldDeactivate && { isActive: false }),
              },
            })
          })

          processed++
        } catch (error) {
          console.error(`[cron] Failed to process recurring invoice ${ri.id}:`, error)
        }
      }

      if (processed > 0) {
        console.warn(`[cron] Processed ${processed} recurring invoices`)
      }
    } catch (error) {
      console.error('[cron] Recurring invoice processing failed:', error)
    }
  })

  job.start()
}
