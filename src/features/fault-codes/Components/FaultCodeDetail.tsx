'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  CloudOff,
  Cpu,
  Gauge,
  GitBranch,
  Leaf,
  LifeBuoy,
  Lightbulb,
  ListChecks,
  RotateCw,
  Wrench,
} from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { openSupport } from '@/features/support/Lib/supportVisibility'
import { track } from '@/lib/analytics'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { OEM_SOURCE_MAKES } from '../Lib/codes'
import { makeKey } from '../Lib/makes'
import { pushRecentLookup } from '../Lib/lookups'
import type {
  FaultCodeFlags,
  FaultCodePageData,
  OemMeaningView,
  OemPageData,
  OemSearchHit,
  ReportState,
} from '../Lib/types'
import { DescriptionSections } from './DescriptionSections'
import { Likelihood } from './Likelihood'
import { ResearchCard } from './ResearchCard'
import { FaultCodeChip, FaultStatusBadge, MeaningSourceLabel } from './FaultCodeChip'
import { FaultCodesNotice } from './FaultCodesNotice'
import { ReportMeaningPopover } from './ReportMeaningPopover'
import { OemWhereUsed } from './OemWhereUsed'
import { ShareFixCard } from './ShareFixCard'
import { WaveformsCard } from './WaveformsCard'
import { WorkshopFixesCard } from './WorkshopFixesCard'

const LIKELIHOOD_RANK = { high: 0, medium: 1, low: 2 } as const
const SYSTEMS = ['P', 'B', 'C', 'U'] as const

/**
 * One code: the meaning and where it comes from, what it means, likely
 * causes, related codes and the jobs here where it was read. The workshop's
 * jobs show whether or not the code service answered.
 *
 * Beside a job (`sheet`) it is one quiet column. On the code's own page
 * (`page`) it spreads out: a header card across the top, the reading
 * (meaning, causes, fixes from other workshops) in a wide column, and the
 * workshop's side (related codes, jobs, share your fix) in a narrower one,
 * stacking on a phone.
 */
export function FaultCodeDetail({
  data,
  onOpenCode,
  layout = 'sheet',
  supportEnabled = false,
  oem,
}: {
  data: FaultCodePageData
  /** Opens a related code in place, as the sheet does; links to its page otherwise. */
  onOpenCode?: (code: string) => void
  layout?: 'sheet' | 'page'
  /** Whether the support widget is there to receive a question (cloud, switched on). */
  supportEnabled?: boolean
  /**
   * A make's own code (BMW's 2A82): its make, the meaning shown and how to
   * switch to another; see FaultCodeOemView, which holds the choice.
   */
  oem?: { data: OemPageData; meaning: OemMeaningView | null; onSelect: (id: string) => void }
}) {
  const t = useTranslations('faultCodes')
  const { formatDate } = useFormatDate()
  const { detail } = data
  const page = layout === 'page'
  const [report, setReport] = useState<ReportState | null>(data.report)
  const title = detail.title

  const oemMake = oem?.data.make
  // Opening a code's page puts it first in this person's recent lookups.
  useEffect(() => {
    if (!page) return
    if (oemMake)
      pushRecentLookup({ kind: 'oem', make: oemMake, code: data.code, title: title ?? null })
    else pushRecentLookup({ kind: 'code', code: data.code, title: title ?? null })
  }, [page, data.code, title, oemMake])

  // Each code opened, and whether we had a meaning for it: the misses say what to add next.
  const found = Boolean(title)
  const onJob = Boolean(data.vehicle)
  useEffect(() => {
    track('fault_code:page_view', {
      code: data.code,
      kind: oemMake ? 'make' : 'obd',
      make: oemMake ?? null,
      found,
      layout: page ? 'page' : 'sheet',
      on_job: onJob,
    })
  }, [data.code, oemMake, found, page, onJob])

  // A make's code is named with its make wherever it leaves this page.
  const named = oem ? `${oem.data.makeName} ${data.code}` : data.code
  const askSupport = () => {
    track('fault_code:support_open', { code: data.code, kind: oem ? 'make' : 'obd' })
    openSupport({
      subject: t('support.subject', { code: named }),
      message: t('support.message', { code: named, title: title ?? t('noMeaning') }),
    })
  }

  const causes = [...detail.causes].sort(
    (a, b) => LIKELIHOOD_RANK[a.likelihood] - LIKELIHOOD_RANK[b.likelihood]
  )
  const system = SYSTEMS.find((s) => data.code.startsWith(s))
  const Heading = page ? 'h1' : 'h2'

  const heading = (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <FaultCodeChip
          code={data.code}
          size="lg"
          className={page ? 'px-2.5 py-1 text-lg' : undefined}
        />
        {oem ? (
          <>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {t('oem.badge', { make: oem.data.makeName })}
            </span>
            {data.vehicle && oem.meaning?.matches && (
              <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                {t('oem.matches')}
              </span>
            )}
          </>
        ) : (
          <>
            {page && system && (
              <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                {t(`systems.${system}`)}
              </span>
            )}
            <MeaningSourceLabel
              source={detail.source}
              make={detail.make}
              machineTranslated={detail.machineTranslated}
            />
          </>
        )}
      </div>
      <Heading
        className={
          page
            ? 'font-display text-xl font-semibold leading-snug tracking-tight sm:text-2xl'
            : 'text-lg font-semibold leading-snug'
        }
      >
        {title ?? (
          <span className="font-normal text-muted-foreground">
            {data.connected && !data.available
              ? t('notAvailable')
              : oem
                ? oem.data.served
                  ? t('oem.notFound', { code: data.code, make: oem.data.makeName })
                  : t('oem.notServed', { make: oem.data.makeName })
                : detail.range === 'manufacturer'
                  ? t('manufacturerUnknown')
                  : t('noMeaning')}
          </span>
        )}
      </Heading>
      {detail.flags && <Flags flags={detail.flags} />}
      {oem?.meaning && <OemOwnWords meaning={oem.meaning} make={oem.data.makeName} />}
      {oem && <OemMeanings oem={oem} />}
    </div>
  )

  const reportButton = data.connected && !oem && (
    <ReportMeaningPopover
      code={data.code}
      version={detail.version}
      lang={detail.lang}
      vehicleId={data.vehicle?.id}
      report={report}
      onReported={setReport}
    />
  )

  const notices = (
    <>
      {!data.connected && data.connectable && (
        <Notice icon={CloudOff}>
          <span>{t('detail.notConnected')}</span>
          <Button asChild size="xs" variant="outline">
            <Link href="/settings/integrations/torqvoice-codes">{t('detail.connect')}</Link>
          </Button>
        </Notice>
      )}
      {data.connected && !data.available && (
        <Notice icon={CloudOff}>{t('detail.serviceDown')}</Notice>
      )}
      {!oem && data.makeCodes && data.makeCodes.length > 0 && (
        <MakeCodes code={data.code} hits={data.makeCodes} vehicleMake={data.vehicle?.make} />
      )}
      {oem &&
        data.vehicle &&
        oem.data.meanings.some((m) => m.modules.length > 0) &&
        !oem.data.meanings.some((m) => m.matches) && (
          <Notice icon={AlertTriangle}>{t('oem.noMatch')}</Notice>
        )}
    </>
  )

  const meaning = (detail.sections.length > 0 || detail.description || detail.pendingCheck) && (
    <Part card={page} icon={BookOpen} title={t('detail.whatItMeans')}>
      <DescriptionSections
        sections={detail.sections}
        description={detail.description}
        layout={layout}
      />
      {detail.pendingCheck && (
        <p className="text-xs text-muted-foreground">{t('detail.pendingCheck')}</p>
      )}
    </Part>
  )

  const causeList = causes.length > 0 && (
    <Part
      card={page}
      icon={ListChecks}
      title={t('detail.likelyCauses')}
      description={page ? t('detail.mostLikelyFirst') : undefined}
      flush={page}
    >
      <ul className={page ? 'divide-y divide-card-edge/60' : 'space-y-2'}>
        {causes.map((cause) => (
          <li
            key={cause.key}
            className={cn('flex items-start gap-3', page && 'items-center px-5 py-3')}
          >
            <Likelihood level={cause.likelihood} />
            <span className="min-w-0 flex-1 text-sm">{cause.label}</span>
            {page && (
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {t(`detail.likelihood.${cause.likelihood}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Part>
  )

  const related = detail.related.length > 0 && (
    <Part
      card={page}
      icon={GitBranch}
      title={t('detail.relatedCodes')}
      badge={page ? detail.related.length : undefined}
      flush={page}
    >
      <ul className={page ? 'divide-y divide-card-edge/60' : 'space-y-1.5'}>
        {detail.related.map((r) =>
          page ? (
            <li key={r.code}>
              <Link
                href={`/fault-codes/${r.code}`}
                className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/50"
              >
                <FaultCodeChip code={r.code} />
                <span className="line-clamp-2 min-w-0 flex-1 text-sm text-muted-foreground group-hover:text-foreground">
                  {r.title}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </Link>
            </li>
          ) : (
            <li key={r.code} className="flex items-center gap-2">
              {onOpenCode ? (
                <FaultCodeChip code={r.code} onClick={() => onOpenCode(r.code)} />
              ) : (
                <Link href={`/fault-codes/${r.code}`} aria-label={t('chip.open', { code: r.code })}>
                  <FaultCodeChip
                    code={r.code}
                    className="cursor-pointer hover:border-primary/40 hover:bg-primary/10"
                  />
                </Link>
              )}
              {r.title && <span className="truncate text-sm text-muted-foreground">{r.title}</span>}
            </li>
          )
        )}
      </ul>
    </Part>
  )

  const jobs = (
    <Part
      card={page}
      icon={Wrench}
      title={t('detail.inYourWorkshop')}
      badge={page && data.jobs.length > 0 ? data.jobs.length : undefined}
      flush={page && data.jobs.length > 0}
    >
      {data.jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('detail.noJobs')}</p>
      ) : (
        <ul className={page ? 'divide-y divide-card-edge/60' : 'divide-y rounded-md border'}>
          {data.jobs.map((job) => {
            const href = job.serviceRecordId
              ? `/vehicles/${job.vehicleId}/service/${job.serviceRecordId}`
              : `/vehicles/${job.vehicleId}`
            return (
              <li key={job.findingId}>
                <Link
                  href={href}
                  className={cn(
                    'flex flex-col gap-0.5 text-sm hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3',
                    page ? 'px-5 py-2.5' : 'px-3 py-2'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{job.title ?? job.vehicle}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[job.title ? job.vehicle : null, job.licensePlate]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <FaultStatusBadge status={job.faultStatus} />
                    {job.status === 'resolved' && <span>{t('detail.resolved')}</span>}
                    <span>{formatDate(job.at)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Part>
  )

  // Where the make uses it comes from its control units; a code known only from our text has none.
  const whereUsed = oem?.meaning && oem.meaning.modules.length > 0 && (
    <Part card={page} icon={Cpu} title={t('oem.whereUsed', { make: oem.data.makeName })}>
      <OemWhereUsed meaning={oem.meaning} layout={layout} />
    </Part>
  )

  // Researching a fix lives on the code's own page, beside the shared fixes.
  const researchCard = page && data.connected && data.research && (
    <ResearchCard
      code={oem ? oem.data.fixCode : data.code}
      label={named}
      meaning={oem?.meaning ? { id: oem.meaning.id, title: oem.meaning.title } : null}
      vehicleId={data.vehicle?.id ?? null}
      state={data.research}
    />
  )

  // Shared fixes live on the code's own page, where there is room for them.
  const fixes = page && data.connected && data.fixes
  const fromOtherWorkshops = fixes && (
    <WorkshopFixesCard
      code={oem ? oem.data.fixCode : data.code}
      label={named}
      meaning={oem?.meaning?.id ?? null}
      fixes={data.fixes?.published ?? []}
      available={data.fixes?.available ?? false}
    />
  )
  const shareFix = fixes && (
    <ShareFixCard
      code={oem ? oem.data.fixCode : data.code}
      label={named}
      meaning={oem?.meaning ? { id: oem.meaning.id, title: oem.meaning.title } : null}
      makes={oem ? (OEM_SOURCE_MAKES[oem.data.make] ?? [oem.data.makeName]) : null}
      vehicle={data.vehicle}
      own={data.fixes?.own ?? []}
      available={data.fixes?.available ?? false}
    />
  )

  // Scope recordings, known good and faulty, beside the fixes on the code's own page.
  const waveforms = page && data.connected && data.waveforms && (
    <WaveformsCard
      code={oem ? oem.data.fixCode : data.code}
      label={named}
      meaning={oem?.meaning ? { id: oem.meaning.id, title: oem.meaning.title } : null}
      makes={oem ? (OEM_SOURCE_MAKES[oem.data.make] ?? [oem.data.makeName]) : null}
      vehicle={data.vehicle}
      state={data.waveforms}
    />
  )

  if (!page) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          {heading}
          {reportButton}
        </header>
        {notices}
        {meaning}
        {causeList}
        {whereUsed}
        {related}
        {jobs}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-lg border border-card-edge bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(28rem_10rem_at_0%_0%,color-mix(in_oklab,var(--primary)_9%,transparent),transparent_70%)]">
        <div className="relative flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          {heading}
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-end">
            <div className="flex flex-wrap items-center gap-1">
              {reportButton}
              {supportEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={askSupport}
                  className="gap-1.5"
                >
                  <LifeBuoy className="size-3.5" />
                  {t('support.button')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>
      <FaultCodesNotice makes={data.oemMakes} improve={data.connected ? { code: named } : null} />
      {notices}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          {meaning}
          {causeList}
          {researchCard}
          {fromOtherWorkshops}
          {waveforms}
          {shareFix && <div id="share-fix">{shareFix}</div>}
        </div>
        <div className="min-w-0 space-y-4">
          {whereUsed}
          {related}
          {jobs}
        </div>
      </div>
    </div>
  )
}

/**
 * One part of the detail: a plain titled block beside a job, a house card
 * on the code's page. `flush` lets a list draw its own rows edge to edge.
 */
function Part({
  card,
  icon,
  title,
  description,
  badge,
  flush,
  children,
}: {
  card: boolean
  icon: typeof AlertTriangle
  title: string
  description?: string
  badge?: number
  flush?: boolean
  children: React.ReactNode
}) {
  if (card) {
    return (
      <AppCard
        icon={icon}
        title={title}
        description={description}
        badge={badge}
        contentClassName={flush ? 'p-0 py-1' : 'space-y-3'}
      >
        {children}
      </AppCard>
    )
  }
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Notice({
  icon: Icon,
  children,
}: {
  icon: typeof AlertTriangle
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" />
      {children}
    </div>
  )
}

function Flags({ flags }: { flags: FaultCodeFlags }) {
  const t = useTranslations('faultCodes.flags')
  const items = [
    flags.warningLight && { key: 'warningLight', icon: Lightbulb },
    flags.emissions && { key: 'emissions', icon: Leaf },
    flags.driveCycle && { key: 'driveCycle', icon: RotateCw },
    flags.limpMode && { key: 'limpMode', icon: Gauge },
  ].filter(Boolean) as {
    key: 'warningLight' | 'emissions' | 'driveCycle' | 'limpMode'
    icon: typeof Wrench
  }[]
  if (items.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map(({ key, icon: Icon }) => (
        <li
          key={key}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <Icon className="size-3" />
          {t(key)}
        </li>
      ))}
    </ul>
  )
}

/**
 * Makes that give this code a meaning of their own (Ford's P1000), each a link to that
 * meaning's page; the car's own make first and marked.
 */
function MakeCodes({
  code,
  hits,
  vehicleMake,
}: {
  code: string
  hits: OemSearchHit[]
  vehicleMake?: string | null
}) {
  const t = useTranslations('faultCodes.makeCodes')
  const own = vehicleMake ? makeKey(vehicleMake) : null
  return (
    <div className="rounded-lg border border-card-edge bg-card px-4 py-3">
      <p className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <Cpu className="size-4 text-primary" aria-hidden />
        {t('heading', { code })}
      </p>
      <ul className="space-y-1">
        {hits.map((h) => (
          <li key={h.make}>
            <Link
              href={`/fault-codes/oem/${h.make}/${h.code}`}
              onClick={() =>
                track('fault_code:make_code_open', {
                  code: h.code,
                  make: h.make,
                  own_make: h.make === own,
                })
              }
              className="group flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
            >
              <span className="font-medium">{h.makeName}</span>
              <span className="text-muted-foreground group-hover:text-foreground group-hover:underline">
                {h.title}
              </span>
              {h.make === own && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                  {t('thisCar')}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The make's own words under our title, or its English under its own text. */
function OemOwnWords({ meaning, make }: { meaning: OemMeaningView; make: string }) {
  const t = useTranslations('faultCodes.oem')
  // A code known only from our text has no words of the make's own.
  if (!meaning.text) return null
  if (meaning.ownTitle)
    return (
      <p className="text-sm text-muted-foreground" lang={meaning.textLang}>
        {t('bmwText', { text: meaning.text, make })}
      </p>
    )
  if (meaning.textEn && meaning.textLang !== 'en')
    return (
      <p className="text-sm text-muted-foreground" lang="en">
        {t('inEnglish', { text: meaning.textEn, make })}
      </p>
    )
  return null
}

/**
 * The meanings a make's code has, one chosen: BMW's 2A82 is the inlet VANOS on
 * one engine computer and a lambda fault on another. The one fitting the car
 * comes first and is marked.
 */
function OemMeanings({
  oem,
}: {
  oem: { data: OemPageData; meaning: OemMeaningView | null; onSelect: (id: string) => void }
}) {
  const t = useTranslations('faultCodes.oem')
  const { meanings } = oem.data
  if (meanings.length < 2) return null
  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs text-muted-foreground">{t('summary', { count: meanings.length })}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('meanings')}>
        {meanings.map((m) => {
          const on = m.id === oem.meaning?.id
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => oem.onSelect(m.id)}
              className={cn(
                'inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-left text-xs transition-colors',
                on
                  ? 'border-primary/50 bg-primary/10 font-medium text-foreground'
                  : 'border-card-edge bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground'
              )}
            >
              <span className="truncate" lang={m.titleLang}>
                {m.title}
              </span>
              {m.matches && (
                <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
                  {t('fitsThisCar')}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
