import { CronJob } from 'cron'
import { createTranslator } from 'next-intl'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { getOrgFromAddress, sendOrgMail } from '@/lib/email'
import { escapeHtml } from '@/lib/account-mail'
import { frozenOrganizationIds, isRestoring } from '@/lib/backup/freeze'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDayKey } from '@/lib/timezone'
import { serviceRecordHref } from '@/lib/service-record'
import { resolveDocumentLocale } from '@/i18n/locale-from-request'
import { dispatchScheduledMessage } from '@/features/scheduled-messages/Lib/dispatchScheduledMessage'
import { isNotificationDue } from '@/features/calendar/Lib/notificationTiming'
import { MAX_NOTICE_MINUTES } from '@/features/calendar/Schema/bookingSchema'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { DEFAULT_TIME_FORMAT } from '@/lib/format'

const LOG_PREFIX = '[appointment-notifications]'

type Translate = (key: string, values?: Record<string, string | number>) => string

/** The notification texts in the workshop's language, which is what its customers read. */
async function translatorFor(locale: string): Promise<Translate> {
  const messages = (await import(`../../../messages/${locale}/calendar.json`)).default
  return createTranslator({
    locale,
    messages: { calendar: messages },
    namespace: 'calendar.notify',
  } as Parameters<typeof createTranslator>[0]) as unknown as Translate
}

interface Workshop {
  name: string
  timeZone: string
  locale: string
  /** The clock the workshop reads, 12 or 24 hours, whatever the language's habit. */
  hour12: boolean
  t: Translate
}

const vehicleLabel = (v: {
  year: number
  make: string
  model: string
  licensePlate: string | null
}) => `${v.year} ${v.make} ${v.model}${v.licensePlate ? ` (${v.licensePlate})` : ''}`

/**
 * Sends the notifications whose time has come: for appointments, and for
 * booked jobs whose car has not arrived.
 *
 * The start is read afresh every minute from the appointment or the job, so
 * moving either, from the calendar or on the work board, moves its
 * notifications with it. Each goes out once for each start it is due for:
 * it is claimed by stamping that start before it is sent, so two servers
 * never send it twice, and a failed send is logged rather than retried
 * every minute.
 */
export async function processDueAppointmentNotifications(now = new Date()): Promise<number> {
  const frozen = frozenOrganizationIds()
  // Nothing further ahead than the longest notice, plus a day for "at"
  // times, can be due yet.
  const horizon = new Date(now.getTime() + (MAX_NOTICE_MINUTES + 24 * 60) * 60_000)
  const rows = await db.appointmentNotification.findMany({
    where: {
      ...(frozen.length ? { organizationId: { notIn: frozen } } : {}),
      OR: [
        { appointment: { startAt: { gt: now, lte: horizon } } },
        {
          serviceRecord: { status: 'scheduled', startDateTime: { gt: now, lte: horizon } },
        },
      ],
    },
    select: {
      id: true,
      channel: true,
      amount: true,
      unit: true,
      atTime: true,
      sentForStart: true,
      updatedAt: true,
      organizationId: true,
      user: { select: { email: true } },
      appointment: {
        select: {
          id: true,
          title: true,
          startAt: true,
          customerId: true,
          vehicleId: true,
          customer: { select: { name: true } },
          vehicle: {
            select: { year: true, make: true, model: true, licensePlate: true },
          },
        },
      },
      serviceRecord: {
        select: {
          id: true,
          title: true,
          startDateTime: true,
          invoiceNumber: true,
          customerId: true,
          vehicleId: true,
          customer: { select: { name: true } },
          vehicle: {
            select: {
              year: true,
              make: true,
              model: true,
              licensePlate: true,
              customerId: true,
              customer: { select: { name: true } },
            },
          },
        },
      },
    },
    take: 2000,
  })

  const workshops = new Map<string, Workshop>()
  const workshopOf = async (organizationId: string): Promise<Workshop> => {
    const known = workshops.get(organizationId)
    if (known) return known
    const [org, timeZone, locale, clock] = await Promise.all([
      db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      workshopTimeZone(organizationId),
      resolveDocumentLocale(organizationId),
      db.appSetting.findUnique({
        where: { organizationId_key: { organizationId, key: SETTING_KEYS.TIME_FORMAT } },
        select: { value: true },
      }),
    ])
    const made = {
      name: org?.name ?? '',
      timeZone,
      locale,
      hour12: (clock?.value || DEFAULT_TIME_FORMAT) === '12h',
      t: await translatorFor(locale),
    }
    workshops.set(organizationId, made)
    return made
  }

  let sent = 0
  for (const row of rows) {
    if (isRestoring(row.organizationId)) continue
    const a = row.appointment
    const job = row.serviceRecord
    const start = a?.startAt ?? job?.startDateTime
    if (!start) continue
    const shop = await workshopOf(row.organizationId)
    const due = isNotificationDue(
      {
        start,
        timing: { amount: row.amount, unit: row.unit, atTime: row.atTime },
        sentForStart: row.sentForStart,
        setAt: row.updatedAt,
      },
      now,
      shop.timeZone
    )
    if (!due) continue

    // Claimed for this start before anything goes out.
    const claimed = await db.appointmentNotification.updateMany({
      where: {
        id: row.id,
        OR: [{ sentForStart: null }, { sentForStart: { not: start } }],
      },
      data: { sentForStart: start },
    })
    if (claimed.count === 0) continue

    const title = a?.title ?? job?.title ?? ''
    const customerName = a?.customer?.name ?? job?.customer?.name ?? job?.vehicle?.customer?.name
    const vehicle = a?.vehicle ?? job?.vehicle ?? null
    const when = new Intl.DateTimeFormat(shop.locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: shop.hour12,
      timeZone: shop.timeZone,
    }).format(start)
    const about = [when, customerName, vehicle ? vehicleLabel(vehicle) : null]
      .filter(Boolean)
      .join(' · ')
    const url = a
      ? `/calendar?view=day&date=${zonedDayKey(start, shop.timeZone)}`
      : serviceRecordHref({ id: job?.id ?? '', vehicleId: job?.vehicleId ?? null })

    try {
      switch (row.channel) {
        case 'in_app':
          await notify({
            organizationId: row.organizationId,
            type: 'appointment.due',
            title: shop.t('inAppTitle', { title }),
            message: about,
            entityType: a ? 'Appointment' : 'ServiceRecord',
            entityId: a?.id ?? job?.id ?? '',
            entityUrl: url,
          })
          break
        case 'email': {
          if (!row.user?.email) throw new Error('Nobody to email: whoever set it has left')
          const subject = shop.t('emailSubject', { title, when })
          await sendOrgMail(row.organizationId, {
            from: await getOrgFromAddress(row.organizationId),
            to: row.user.email,
            subject,
            html: `<div style="font-family:sans-serif;max-width:600px">
<h2 style="margin-bottom:4px">${escapeHtml(title)}</h2>
<p style="color:#444">${escapeHtml(about)}</p>
<p style="color:#666;font-size:13px">${escapeHtml(shop.t('emailFooter'))}</p></div>`,
          })
          break
        }
        case 'customer_sms':
        case 'customer_email': {
          const customerId = a?.customerId ?? job?.customerId ?? job?.vehicle?.customerId ?? null
          if (!customerId) throw new Error('No customer to notify')
          const values = {
            name: customerName ?? '',
            workshop: shop.name,
            when,
            title,
          }
          await dispatchScheduledMessage({
            id: row.id,
            channel: row.channel === 'customer_sms' ? 'sms' : 'email',
            subject: shop.t('customerSubject', values),
            body: shop.t('customerBody', values),
            recipient: null,
            organizationId: row.organizationId,
            customerId,
            vehicleId: a?.vehicleId ?? job?.vehicleId ?? null,
          })
          break
        }
        default:
          throw new Error(`Unknown channel ${row.channel}`)
      }
      sent++
    } catch (error) {
      console.error(
        `${LOG_PREFIX} ${row.channel} for ${row.id} failed:`,
        error instanceof Error ? error.message : error
      )
    }
  }
  return sent
}

/** Minute by minute, so a notification goes out on the minute it was set for. */
export function processAppointmentNotifications() {
  const job = new CronJob('* * * * *', async () => {
    try {
      const sent = await processDueAppointmentNotifications()
      if (sent > 0) console.warn(`${LOG_PREFIX} sent ${sent} notification(s)`)
    } catch (error) {
      console.error(`${LOG_PREFIX} scan failed:`, error)
    }
  })
  job.start()
  console.warn(`${LOG_PREFIX} Appointment notifications started (every minute)`)
}
