import { getLocale, getTranslations } from 'next-intl/server'
import { cache } from 'react'
import { closedShareLinkTitle, ShareLinkClosed } from '@/components/share-link-expired'
import { ShareLinkOpenUntil } from '@/components/share-link-open-until'
import type { ShareLinkLookup } from '@/lib/share-link.server'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { StatusReportView } from './status-report-view'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { getFeatures } from '@/lib/features'
import { formatReportDay } from '@/features/status-reports/Lib/reportDay'
import { workshopDateSettings } from '@/lib/workshop-timezone'
import type { Metadata } from 'next'

function toPublicFileUrl(fileUrl: string, token: string): string {
  const match = fileUrl.match(/^\/api\/protected\/files\/[^/]+\/(.+)$/)
  if (match) return `/api/public/files/${token}/${match[1]}`
  return fileUrl
}

export const revalidate = 0
export const dynamic = 'force-dynamic'

// The report and what it is about: a job, or an inspection.
const vehicle = { select: { make: true, model: true, year: true, licensePlate: true } }
function findReport(token: string) {
  return db.statusReport.findUnique({
    where: { publicToken: token },
    include: {
      serviceRecord: { select: { title: true, vehicle } },
      inspection: { select: { template: { select: { name: true } }, vehicle } },
      technician: { select: { name: true } },
      organization: { select: { name: true } },
    },
  })
}
type Report = NonNullable<Awaited<ReturnType<typeof findReport>>>

/**
 * The same answers the other share pages give. A report the clean-up has
 * deleted, a token cut short and one from another workshop are all "gone".
 */
const lookUpReport = cache(
  async (orgParam: string, token: string): Promise<ShareLinkLookup<Report>> => {
    const org = await resolvePortalOrg(orgParam)
    if (!org) return { status: 'unknownWorkshop' }
    const report = await findReport(token)
    if (!report || report.organizationId !== org.id) {
      return { status: 'gone', organizationId: org.id }
    }
    if (report.expiresAt && report.expiresAt < new Date()) {
      return { status: 'expired', organizationId: org.id }
    }
    return { status: 'open', organizationId: org.id, shared: report }
  }
)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>
}): Promise<Metadata> {
  const { orgId, token } = await params
  const link = await lookUpReport(orgId, token)
  const robots = { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true }
  // A closed link's tab does not say what the link led to.
  if (link.status === 'expired' || link.status === 'gone') {
    return { title: await closedShareLinkTitle(link.organizationId, link.status), robots }
  }
  const t = await getTranslations('statusReport.create')
  return { title: t('title'), robots }
}

export default async function PublicStatusReportPage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>
}) {
  const { orgId: orgParam, token } = await params

  // Only an address with no workshop behind it is the plain 404. A customer
  // whose link is closed gets a page that tells them who to ask.
  const link = await lookUpReport(orgParam, token)
  if (link.status === 'unknownWorkshop') notFound()
  if (link.status !== 'open') {
    return (
      <ShareLinkClosed
        organizationId={link.organizationId}
        status={link.status}
        kind="statusReport"
      />
    )
  }
  const { organizationId: orgId, shared: report } = link

  const subject = report.serviceRecord ?? report.inspection
  if (!subject) {
    return <ShareLinkClosed organizationId={orgId} status="gone" kind="statusReport" />
  }
  const serviceTitle = report.serviceRecord?.title ?? report.inspection?.template.name ?? ''

  // Mark as viewed on first visit
  if (!report.viewedAt) {
    await db.statusReport.update({
      where: { id: report.id },
      data: { viewedAt: new Date(), status: 'viewed' },
    })
  }

  // Fetch workshop settings
  const [settings, features, dates, locale] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: orgId,
        key: {
          in: [
            'workshop.address',
            'workshop.phone',
            'workshop.email',
            'workshop.logo',
            'invoice.primaryColor',
            'workshop.serviceType',
          ],
        },
      },
    }),
    getFeatures(orgId),
    workshopDateSettings(orgId),
    // The page's language: the workshop's when it decides, else the customer's.
    getLocale(),
  ])

  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  // Rewrite video URL if needed
  const videoUrl = report.videoUrl ? toPublicFileUrl(report.videoUrl, token) : null

  return (
    <StatusReportView
      report={{
        id: report.id,
        title: report.title,
        message: report.message,
        videoUrl,
        videoFileName: report.videoFileName,
        status: report.status,
        createdDay: formatReportDay(report.createdAt, dates.dateFormat, dates.timeZone, locale),
        customerFeedback: report.customerFeedback,
        feedbackAt: report.feedbackAt?.toISOString() || null,
      }}
      vehicle={subject.vehicle}
      serviceTitle={serviceTitle}
      subject={report.serviceRecord ? 'service' : 'inspection'}
      technicianName={report.technician?.name || null}
      workshopName={report.organization.name}
      workshopPhone={settingsMap['workshop.phone'] || ''}
      primaryColor={settingsMap['invoice.primaryColor'] || '#3b82f6'}
      token={token}
      showBranding={!features.brandingRemoved}
      expiryNote={
        report.expiresAt && (
          <ShareLinkOpenUntil
            organizationId={orgId}
            expiry={{ kind: 'date', at: report.expiresAt, source: 'document' }}
          />
        )
      }
    />
  )
}
