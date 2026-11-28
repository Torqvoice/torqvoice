import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import {
  type BillingGroupBy,
  type BillingTotals,
  billingBaseSql,
  billingGroupBy,
  billingGroupKeySql,
  billingListConditions,
  billingListSort,
  billingOrderBySql,
  billingRowFromSql,
  billingRowGroupKey,
  billingTotalsFromSql,
  billingTotalsSelectSql,
} from '@/features/billing/Lib/billingList.server'
import { daysBetween } from '@/features/billing/Lib/billingReportModel'
import { isPrintableImage } from '@/features/invoices/Lib/printableImage'
import type { BillingColumn, BillingListInput } from '@/features/billing/Schema/billingListSchema'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { Prisma } from '@/generated/prisma/client'
import { resolveCurrencyCode, resolveCurrencyFormat, type CurrencyFormat } from '@/lib/currencies'
import { db } from '@/lib/db'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { zonedDayKey } from '@/lib/timezone'
import { workshopTodayKey } from '@/lib/workshop-datetime'
import { workshopDateSettings } from '@/lib/workshop-timezone'

/**
 * The most rows one report carries. Far past any page a workshop prints, and
 * small enough that the PDF and the spreadsheet build in a moment; a report
 * that stops short says so on its first page.
 */
export const BILLING_REPORT_ROW_LIMIT = 5000

export type BillingReportRow = ReturnType<typeof billingRowFromSql> & {
  /** Whole days since the shown date, on the workshop's calendar. */
  ageDays: number
  /** The shown date as YYYY-MM-DD on the workshop's calendar. */
  day: string
  /** Nothing is owed on a cancelled invoice. */
  balance: number
}

export interface BillingReportGroup {
  key: string
  /** The customer's name; empty for invoices with no customer, months and statuses. */
  name: string
  totals: BillingTotals
}

export interface BillingReportData {
  workshop: {
    name: string
    address: string
    phone: string
    email: string
    /** A data URI, so the print frame and the PDF draw it without another request. */
    logo?: string
  }
  filters: BillingListInput
  groupBy: BillingGroupBy | null
  columns: BillingColumn[]
  title?: string
  timeZone: string
  dateFormat: string
  timeFormat: '12h' | '24h'
  currencyCode: string
  currencyFormat: CurrencyFormat
  /** When the report was made, as an ISO instant. */
  generatedAt: string
  rows: BillingReportRow[]
  /** True when more rows matched than the report carries. */
  truncated: boolean
  totals: BillingTotals
  /** Every group of the filter, in the order its rows come. */
  groups: BillingReportGroup[]
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/**
 * The workshop logo as a data URI the PDF renderer can draw. It reads PNG
 * and JPEG only, and a damaged file stops the whole PDF, so a WebP logo (or
 * any file that does not hold together) is redrawn as PNG first. A missing
 * or unreadable file prints the name alone.
 */
export async function logoDataUri(logoPath: string | undefined): Promise<string | undefined> {
  if (!logoPath) return undefined
  const mime = MIME_BY_EXT[logoPath.split('.').pop()?.toLowerCase() ?? '']
  if (!mime) return undefined
  try {
    const bytes = await readFile(resolveUploadPath(logoPath))
    if (isPrintableImage(bytes, mime)) return `data:${mime};base64,${bytes.toString('base64')}`
    const png = await sharp(bytes, { failOn: 'error' }).png().toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return undefined
  }
}

type ReportSqlRow = Parameters<typeof billingRowFromSql>[0] & Record<string, unknown>
type TotalsRow = { cnt: bigint; invoiced: unknown; paid: unknown }

/**
 * Everything the billing list shows under the given filters, for a report:
 * every matching row up to the limit (not the batches loaded so far), the
 * totals and group subtotals over the whole filter, and the workshop's
 * letterhead. The same query as the list, so the report and the screen
 * never disagree about which invoices a filter means.
 */
export async function loadBillingReport(
  organizationId: string,
  filters: BillingListInput,
  columns: BillingColumn[],
  title?: string,
  now: Date = new Date()
): Promise<BillingReportData> {
  const { timeZone, dateFormat, timeFormat } = await workshopDateSettings(organizationId)
  const groupBy = billingGroupBy(filters.groupBy)
  const sort = billingListSort(filters.sortBy, filters.sortOrder, groupBy)
  const cond = billingListConditions(filters, timeZone)
  const base = billingBaseSql(organizationId, cond, timeZone)
  const where = Prisma.sql`WHERE 1=1 ${cond.status} ${cond.delivery}`

  const groupKey = groupBy ? billingGroupKeySql(groupBy) : null
  // Rows, totals and subtotals from one snapshot, so a payment recorded
  // while the report is read cannot land in one and not the others.
  const [found, totalsRows, groupRows] = await db.$transaction(
    async (tx) =>
      [
        await tx.$queryRaw<ReportSqlRow[]>(Prisma.sql`
        SELECT sub.* FROM (${base}) sub ${where}
        ORDER BY ${billingOrderBySql(sort)}
        LIMIT ${BILLING_REPORT_ROW_LIMIT + 1}
      `),
        await tx.$queryRaw<TotalsRow[]>(Prisma.sql`
        SELECT ${billingTotalsSelectSql} FROM (${base}) sub ${where}
      `),
        groupKey
          ? await tx.$queryRaw<(TotalsRow & { group_key: string; group_name: string | null })[]>(
              Prisma.sql`
              SELECT ${groupKey} AS group_key, MAX(sub.customer_name) AS group_name, ${billingTotalsSelectSql}
              FROM (${base}) sub ${where}
              GROUP BY 1
            `
            )
          : [],
      ] as const,
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 }
  )
  const [organization, settings] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.appSetting.findMany({
      where: {
        organizationId,
        key: {
          in: [
            SETTING_KEYS.COMPANY_LOGO,
            SETTING_KEYS.WORKSHOP_ADDRESS,
            SETTING_KEYS.WORKSHOP_PHONE,
            SETTING_KEYS.WORKSHOP_EMAIL,
            SETTING_KEYS.CURRENCY_CODE,
            SETTING_KEYS.CURRENCY_FORMAT,
          ],
        },
      },
      select: { key: true, value: true },
    }),
  ])

  const setting = new Map(settings.map((s) => [s.key, s.value]))
  const today = workshopTodayKey(timeZone, now)
  const rows: BillingReportRow[] = found.slice(0, BILLING_REPORT_ROW_LIMIT).map((r) => {
    const row = billingRowFromSql(r)
    const day = zonedDayKey(new Date(row.serviceDate), timeZone)
    return {
      ...row,
      day,
      ageDays: Math.max(0, daysBetween(day, today)),
      balance: row.status === 'cancelled' ? 0 : row.totalAmount - row.totalPaid,
    }
  })

  // Groups in the order their rows come; one with no rows in the report
  // (past the limit) goes last, so its figures are still on paper.
  const byKey = new Map(groupRows.map((g) => [g.group_key ?? '', g]))
  const order: string[] = []
  if (groupBy) {
    for (const row of rows) {
      const key = billingRowGroupKey(row, groupBy)
      if (!order.includes(key)) order.push(key)
    }
    for (const key of byKey.keys()) if (!order.includes(key)) order.push(key)
  }
  const groups = order.map((key) => {
    const g = byKey.get(key)
    return {
      key,
      name: groupBy === 'customer' ? (g?.group_name ?? '') : '',
      totals: billingTotalsFromSql(g),
    }
  })

  return {
    workshop: {
      name: organization?.name ?? '',
      address: setting.get(SETTING_KEYS.WORKSHOP_ADDRESS) ?? '',
      phone: setting.get(SETTING_KEYS.WORKSHOP_PHONE) ?? '',
      email: setting.get(SETTING_KEYS.WORKSHOP_EMAIL) ?? '',
      logo: await logoDataUri(setting.get(SETTING_KEYS.COMPANY_LOGO)),
    },
    filters,
    groupBy,
    columns,
    title: title || undefined,
    timeZone,
    dateFormat,
    timeFormat,
    currencyCode: resolveCurrencyCode(setting.get(SETTING_KEYS.CURRENCY_CODE)),
    currencyFormat: resolveCurrencyFormat(setting.get(SETTING_KEYS.CURRENCY_FORMAT)),
    generatedAt: now.toISOString(),
    rows,
    truncated: found.length > BILLING_REPORT_ROW_LIMIT,
    totals: billingTotalsFromSql(totalsRows[0]),
    groups,
  }
}
