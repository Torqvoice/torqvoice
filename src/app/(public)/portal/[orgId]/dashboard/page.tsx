import { PortalShell } from '@/features/portal/Components/PortalShell'
import { getPortalDashboard } from '@/features/portal/Actions/portalActions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Activity,
  ArrowRight,
  Car,
  ClipboardCheck,
  Download,
  FileQuestion,
  FileText,
  Wrench,
} from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const t = await getTranslations('portal.dashboard')
  const tInvoices = await getTranslations('portal.invoices')
  const result = await getPortalDashboard()

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">{t('failedToLoad')}</p>
      </PortalShell>
    )
  }

  const d = result.data

  return (
    <PortalShell orgId={orgId}>
      <div className="space-y-6">
        {/* Welcome line */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t('welcome', { name: d.customer?.name ?? 'Customer' })}
          </h1>
          <p className="text-sm text-muted-foreground">{t('overview')}</p>
        </div>

        {/* Quick actions strip */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickAction
            href={`/portal/${orgId}/request-service`}
            icon={<Wrench className="h-5 w-5" />}
            label={t('quickRequestService')}
            sublabel={t('quickRequestServiceHint')}
            primary
          />
          <QuickAction
            href={`/portal/${orgId}/invoices`}
            icon={<FileText className="h-5 w-5" />}
            label={t('quickViewInvoices')}
            sublabel={t('quickViewInvoicesHint')}
          />
          <QuickAction
            href={`/portal/${orgId}/vehicles`}
            icon={<Car className="h-5 w-5" />}
            label={t('quickViewVehicles')}
            sublabel={t('quickViewVehiclesHint')}
          />
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label={t('vehicles')}
            value={d.vehicleCount}
            icon={<Car className="h-4 w-4" />}
            href={`/portal/${orgId}/vehicles`}
          />
          <KpiTile
            label={t('openInvoices')}
            value={d.openInvoiceCount}
            icon={<FileText className="h-4 w-4" />}
            href={`/portal/${orgId}/invoices`}
          />
          <KpiTile
            label={t('pendingQuotes')}
            value={d.pendingQuoteCount}
            icon={<FileQuestion className="h-4 w-4" />}
            href={`/portal/${orgId}/quotes`}
          />
          <KpiTile
            label={t('pendingServiceRequests')}
            value={d.pendingRequests.length}
            icon={<ClipboardCheck className="h-4 w-4" />}
            href={`/portal/${orgId}/request-service`}
          />
        </div>

        {/* Two-column main grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Recent invoices — wider */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">{t('recentInvoices')}</CardTitle>
              <Link
                href={`/portal/${orgId}/invoices`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {t('viewAll')}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {d.recentInvoices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t('noInvoicesYet')}
                </p>
              ) : (
                <ul className="divide-y">
                  {d.recentInvoices.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {inv.invoiceNumber ? `#${inv.invoiceNumber}` : inv.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {inv.vehicle?.make} {inv.vehicle?.model} ·{' '}
                          {new Date(inv.startDateTime ?? inv.serviceDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge variant="outline" className="text-xs">
                          {inv.status}
                        </Badge>
                        {inv.publicToken && (
                          <Link
                            href={`/share/invoice/${orgId}/${inv.publicToken}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            {t('view')}
                          </Link>
                        )}
                        <a
                          href={`/portal/${orgId}/invoices/${inv.id}/pdf`}
                          download
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          aria-label={tInvoices('download')}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Recent quotes — narrower */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">{t('recentQuotes')}</CardTitle>
              <Link
                href={`/portal/${orgId}/quotes`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {t('viewAll')}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {d.recentQuotes.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('noQuotesYet')}</p>
              ) : (
                <ul className="divide-y">
                  {d.recentQuotes.map((q) => (
                    <li
                      key={q.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {q.quoteNumber ? `#${q.quoteNumber}` : q.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {q.vehicle?.make} {q.vehicle?.model}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {q.status}
                        </Badge>
                        {q.publicToken && (
                          <Link
                            href={`/share/quote/${orgId}/${q.publicToken}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            {t('view')}
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active jobs (only if any) */}
        {d.activeJobs.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                {t('activeJobs')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y">
                {d.activeJobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{job.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {job.vehicle?.make} {job.vehicle?.model} ·{' '}
                        {new Date(job.startDateTime ?? job.serviceDate).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {job.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Pending requests (only if any) */}
        {d.pendingRequests.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">{t('pendingServiceRequests')}</CardTitle>
              <Button asChild size="sm" variant="outline">
                <Link href={`/portal/${orgId}/request-service`}>
                  <Wrench className="mr-1.5 h-3.5 w-3.5" />
                  {t('newRequest')}
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y">
                {d.pendingRequests.map((req) => (
                  <li
                    key={req.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{req.description.slice(0, 80)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {req.vehicle?.make} {req.vehicle?.model} ·{' '}
                        {new Date(req.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {t('pending')}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalShell>
  )
}

function QuickAction({
  href,
  icon,
  label,
  sublabel,
  primary,
}: {
  href: string
  icon: React.ReactNode
  label: string
  sublabel: string
  primary?: boolean
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? 'group flex items-center gap-3 rounded-lg border-2 border-primary/40 bg-primary/5 p-4 transition-all hover:border-primary hover:bg-primary/10'
          : 'group flex items-center gap-3 rounded-lg border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm'
      }
    >
      <span
        className={
          primary
            ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'
            : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'
        }
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{sublabel}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  )
}

function KpiTile({
  label,
  value,
  icon,
  href,
}: {
  label: string
  value: number
  icon: React.ReactNode
  href: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40"
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </div>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
    </Link>
  )
}
