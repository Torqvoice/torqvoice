import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { type ShareExpiry, shareOpenUntilDay } from '@/lib/share-expiry'
import { resolveWorkshopTimeZone } from '@/lib/timezone'

/**
 * One quiet line at the foot of a share page saying the day its link stops
 * working, so the customer is not surprised by a closed link later.
 *
 * It belongs to the page, never to the document: the sheet and the PDF are
 * what was issued, and the day depends on a rule the workshop can change.
 * Nothing is shown for a link with no date, which includes an unpaid invoice
 * that stays open until it is paid.
 *
 * The day is the workshop's, in the workshop's date format.
 */
export async function ShareLinkOpenUntil({
  organizationId,
  expiry,
}: {
  organizationId: string
  expiry: ShareExpiry
}) {
  if (expiry.kind !== 'date') return null

  const [org, rows, acceptLanguage] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.appSetting.findMany({
      where: {
        organizationId,
        key: { in: ['workshop.timezone', 'workshop.timezoneDetected', 'workshop.dateFormat'] },
      },
      select: { key: true, value: true },
    }),
    headers().then((h) => h.get('accept-language')),
  ])
  const setting = (key: string) => rows.find((r) => r.key === key)?.value
  const timeZone = resolveWorkshopTimeZone(
    setting('workshop.timezone'),
    setting('workshop.timezoneDetected')
  )
  const day = shareOpenUntilDay(expiry, timeZone)
  if (!day) return null

  const locale = await resolveCustomerLocale(organizationId, acceptLanguage)
  const t = await getTranslations({ locale, namespace: 'share.openUntil' })
  const date = formatDate(day, setting('workshop.dateFormat') || undefined, timeZone)
  const workshop = org?.name?.trim()

  return (
    <p className="mt-3 text-balance text-center text-xs text-muted-foreground print:hidden">
      {workshop ? t('text', { date, workshop }) : t('textNoName', { date })}
    </p>
  )
}
