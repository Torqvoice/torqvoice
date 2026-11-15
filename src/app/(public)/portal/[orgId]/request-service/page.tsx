import { getTranslations } from 'next-intl/server'
import {
  getPortalClosedDays,
  getPortalOpeningHours,
  getPortalServiceRequests,
  getPortalVehicles,
} from '@/features/portal/Actions/portalActions'
import {
  PortalLoadFailed,
  PortalPageHead,
} from '@/features/portal/Components/Detail/PortalPageParts'
import { PortalFileThumb } from '@/features/portal/Components/Detail/PortalFileThumb'
import { PortalOpeningHours } from '@/features/portal/Components/PortalOpeningHours'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import { ServiceRequestForm } from '@/features/portal/Components/ServiceRequestForm'
import {
  PortalBadge,
  PortalLinkButton,
  PortalPanel,
  PortalSectionLabel,
} from '@/features/portal/Components/Ui'
import { readAttachments } from '@/features/portal/Lib/chat.server'
import { portalFormat } from '@/features/portal/Lib/portalFormat'
import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { splitRequestText } from '@/features/portal/Lib/requestText'
import { portalRequestBadge, portalStatusLabel } from '@/features/portal/Lib/statusLabels'
import { loadPortalWorkshop } from '@/features/portal/Lib/workshop.server'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { zonedDayKey } from '@/lib/timezone'
import { workshopTimeZone } from '@/lib/workshop-timezone'

/** A job in one of these is a car standing in the workshop. */
const IN_WORKSHOP = ['in-progress', 'waiting-parts']

/**
 * Book a visit. The form fills the page on a desk, with what happens next,
 * the opening hours and the other ways to reach the workshop in a column
 * beside it; on a phone it is one column, the form first. What the customer
 * has already asked for follows under the form, with the photos they sent.
 */
export default async function PortalRequestServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams?: Promise<{ vehicle?: string | string[] }>
}) {
  const { orgId } = await params
  const org = await resolvePortalOrg(orgId)
  // No such workshop: the shell says so.
  if (!org) return <PortalShell orgId={orgId}>{null}</PortalShell>

  const [t, tStatus, tNav] = await Promise.all([
    getTranslations('portal.book'),
    getTranslations('portal.status'),
    getTranslations('portal.nav'),
  ])
  const [
    vehiclesResult,
    requestsResult,
    closedResult,
    hoursResult,
    fmt,
    timeZone,
    look,
    workshop,
    query,
  ] = await Promise.all([
    getPortalVehicles(),
    getPortalServiceRequests(),
    getPortalClosedDays(),
    getPortalOpeningHours(),
    portalFormat(org.id),
    workshopTimeZone(org.id),
    loadPortalLook(org.id),
    loadPortalWorkshop(org.id, org.name),
    searchParams,
  ])
  const day = (at: Date | string) => fmt.day(new Date(at).toISOString())

  if (!vehiclesResult.success || !vehiclesResult.data) {
    return (
      <PortalShell orgId={orgId}>
        <PortalPageHead title={t('title')} />
        <PortalLoadFailed>{t('failedToLoad')}</PortalLoadFailed>
      </PortalShell>
    )
  }

  // Which of the cars is standing in the workshop right now: said on its
  // choice, as the home says it. The form works without knowing.
  const vehicleIds = vehiclesResult.data.map((v) => v.id)
  const standing = await db.serviceRecord
    .findMany({
      where: {
        organizationId: org.id,
        vehicleId: { in: vehicleIds },
        status: { in: IN_WORKSHOP },
      },
      select: { vehicleId: true },
    })
    .catch(() => [])
  const inWorkshop = new Set(standing.map((job) => job.vehicleId))

  const vehicles = vehiclesResult.data.map((v) => ({
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    licensePlate: v.licensePlate,
    inWorkshop: inWorkshop.has(v.id),
  }))

  const requests = requestsResult.success ? (requestsResult.data ?? []) : []
  const hours = hoursResult.success ? hoursResult.data : undefined
  // The first day a customer can ask for is the workshop's today, not the
  // browser's and not the server's.
  const today = hours?.today ?? zonedDayKey(new Date(), timeZone)
  const closedWeekdays = hours ? hours.week.flatMap((d, weekday) => (d.open ? [] : [weekday])) : []
  const asked = typeof query?.vehicle === 'string' ? query.vehicle : undefined
  const steps = [
    t('nextRead'),
    look.messagesEnabled ? t('nextAnswerMessages') : t('nextAnswer'),
    t('nextVisit'),
  ]

  return (
    <PortalShell orgId={orgId}>
      <PortalPageHead
        title={t('title')}
        description={look.messagesEnabled ? t('descriptionMessages') : t('description')}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-7">
        <div className="flex min-w-0 flex-col gap-6">
          {/* The form handles the no-vehicles case itself: it opens on
              "another car", so a new customer can still ask. */}
          <ServiceRequestForm
            orgId={orgId}
            workshopName={workshop.name}
            vehicles={vehicles}
            today={today}
            closedDays={closedResult.success ? (closedResult.data ?? []) : []}
            closedWeekdays={closedWeekdays}
            week={hours?.week}
            marine={workshop.marine}
            messagesEnabled={look.messagesEnabled}
            initialVehicleId={asked}
          />

          {requests.length > 0 && (
            <PortalPanel aria-labelledby="your-requests">
              <PortalSectionLabel id="your-requests">{t('yourRequests')}</PortalSectionLabel>
              <ul className="mt-2 flex flex-col">
                {requests.map((req) => {
                  const badge = portalRequestBadge(req.status)
                  const files = readAttachments(org.id, req.attachments)
                  const words = splitRequestText(req.description)
                  return (
                    <li
                      key={req.id}
                      className="flex flex-col gap-2.5 border-b py-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold">
                          {req.vehicle.make} {req.vehicle.model}
                        </p>
                        {words.topic && (
                          <p data-request-topic className="mt-1 text-[15px] font-semibold">
                            {words.topic}
                          </p>
                        )}
                        <p
                          className={`whitespace-pre-line break-words text-[15px] ${words.topic ? 'mt-0.5' : 'mt-1'}`}
                        >
                          {words.body}
                        </p>
                        {files.length > 0 && (
                          <ul
                            aria-label={t('requestFiles', { count: files.length })}
                            className="mt-2.5 flex flex-wrap gap-2"
                          >
                            {files.map((file) => (
                              <li key={file.url}>
                                <PortalFileThumb
                                  url={file.url}
                                  kind={file.kind}
                                  label={t(file.kind === 'video' ? 'requestVideo' : 'requestPhoto')}
                                  missingLabel={t('requestFileMissing')}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="p-muted mt-2 text-[13px]">
                          {t('sentOn', { date: day(req.createdAt) })}
                          {req.preferredDate &&
                            ` · ${t('preferred', { date: day(req.preferredDate) })}`}
                          {req.preferredDate &&
                            (req.preferredTime === 'morning' ||
                              req.preferredTime === 'afternoon') &&
                            `, ${t(`timeLower.${req.preferredTime}`)}`}
                        </p>
                        {req.adminNotes && (
                          <p className="mt-2 whitespace-pre-line break-words rounded-[var(--p-radius-field)] bg-[var(--p-soft)] px-3.5 py-2.5 text-sm">
                            {t('staffNotes', { notes: req.adminNotes })}
                          </p>
                        )}
                      </div>
                      <span data-status={req.status} className="shrink-0">
                        <PortalBadge tone={badge.tone} className={badge.className}>
                          {portalStatusLabel('request', req.status, tStatus)}
                        </PortalBadge>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </PortalPanel>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <PortalPanel tone="hero" aria-labelledby="book-next">
            <PortalSectionLabel id="book-next">{t('nextTitle')}</PortalSectionLabel>
            <ol className="mt-3 flex flex-col gap-3.5 text-[15px] leading-snug">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden
                    className={[
                      'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                      index === 0
                        ? 'bg-[var(--p-bar-on)] text-[color:var(--p-hero-bg)]'
                        : 'bg-[var(--p-bar-off)] text-[color:var(--p-hero-ink)]',
                    ].join(' ')}
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </PortalPanel>

          {hours && <PortalOpeningHours hours={hours} />}

          {(workshop.phoneHref || look.messagesEnabled) && (
            <PortalPanel aria-labelledby="book-talk">
              <PortalSectionLabel id="book-talk">{t('talkTitle')}</PortalSectionLabel>
              {/* Side by side only where each fits on one line: a button whose
                  words do not fit takes a row of its own instead of breaking
                  the phone number in two. */}
              <div className="mt-3 flex flex-wrap gap-2.5">
                {workshop.phoneHref && workshop.phone && (
                  <PortalLinkButton href={workshop.phoneHref} className="flex-[1_1_auto]">
                    {t('talkCall', { phone: workshop.phone })}
                  </PortalLinkButton>
                )}
                {look.messagesEnabled && (
                  <PortalLinkButton href={`/portal/${orgId}/messages`} className="flex-[1_1_auto]">
                    {tNav('messages')}
                  </PortalLinkButton>
                )}
              </div>
            </PortalPanel>
          )}
        </aside>
      </div>
    </PortalShell>
  )
}
