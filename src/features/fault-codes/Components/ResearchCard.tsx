'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  SearchX,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { track } from '@/lib/analytics'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import type { FaultCodeResearch } from '@/features/integrations/Lib/types'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { rateFaultCodeResearch } from '../Actions/rateFaultCodeResearch'
import { researchFaultCode } from '../Actions/researchFaultCode'
import type { ResearchState } from '../Lib/types'
import { Likelihood } from './Likelihood'

const LIKELIHOOD_RANK = { high: 0, medium: 1, low: 2 } as const
/** How often the working card names its next step. */
const STEP_MS = 7000

/**
 * "Research a fix" on a code's page: AI searches manufacturer documents, bulletins and
 * workshop forums, and only a specific answer with sources is kept, for a person at Torqvoice
 * to check. What one workshop researched every workshop sees, so a code is researched once.
 * A search that found nothing says so plainly, and nothing is saved.
 */
export function ResearchCard({
  code,
  label,
  meaning = null,
  vehicleId = null,
  state,
}: {
  /** The code as the service keys it: P0420, or BMW-2A82 for a make's own. */
  code: string
  /** The code as people read it: P0420, BMW 2A82. */
  label: string
  /** For a make's code, the meaning on screen; research is per meaning. */
  meaning?: { id: string; title: string } | null
  vehicleId?: string | null
  state: ResearchState
}) {
  const t = useTranslations('faultCodes.research')
  const router = useRouter()
  const [items, setItems] = useState(state.items)
  const [working, setWorking] = useState(false)
  const item = items.find((i) => (i.meaning ?? null) === (meaning?.id ?? null)) ?? null

  const start = async () => {
    setWorking(true)
    track('fault_code:research_start', { code })
    const result = await researchFaultCode({ code, meaning: meaning?.id, vehicleId })
    setWorking(false)
    if (!result.success || !result.data) {
      track('fault_code:research_result', { code, outcome: 'failed' })
      toast.error(t('errors.failed'))
      return
    }
    const outcome = result.data
    track('fault_code:research_result', {
      code,
      outcome: outcome.outcome === 'done' ? outcome.research.status : outcome.outcome,
    })
    if (outcome.outcome === 'done') {
      const found = outcome.research
      setItems((current) => [
        ...current.filter(
          (i) => i.id !== found.id && (i.meaning ?? null) !== (found.meaning ?? null)
        ),
        found,
      ])
      return
    }
    toast.error(
      t(
        `errors.${outcome.outcome === 'busy' || outcome.outcome === 'limited' ? outcome.outcome : 'failed'}`
      )
    )
  }

  const subject = meaning ? `${label} · ${meaning.title}` : label

  if (working) return <Working subject={subject} />
  if (!item) {
    if (!state.available) return null
    return (
      <AppCard icon={Sparkles} title={t('inviteTitle')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t('invite', { code: subject })}</p>
          <Button type="button" onClick={start} className="shrink-0 gap-1.5">
            <Sparkles className="size-4" />
            {t('button')}
          </Button>
        </div>
      </AppCard>
    )
  }
  if (item.status === 'running') {
    return (
      <AppCard icon={Sparkles} title={t('runningTitle')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t('runningHint')}</p>
          <Button type="button" variant="outline" onClick={() => router.refresh()}>
            {t('checkAgain')}
          </Button>
        </div>
      </AppCard>
    )
  }
  if (item.status === 'missed' || !item.findings) return <Missed item={item} subject={subject} />
  return <Findings item={item} />
}

/** While the research runs: what it is doing, so a minute of waiting reads as work. */
function Working({ subject }: { subject: string }) {
  const t = useTranslations('faultCodes.research')
  const steps = [t('steps.bulletins'), t('steps.forums'), t('steps.agree'), t('steps.writing')]
  const [step, setStep] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, 3)), STEP_MS)
    return () => clearInterval(timer)
  }, [])
  return (
    <AppCard icon={Sparkles} title={t('working', { code: subject })}>
      <div className="space-y-3" aria-live="polite">
        <ol className="space-y-1.5 text-sm">
          {steps.map((s, i) => (
            <li
              key={s}
              className={cn(
                'flex items-center gap-2',
                i < step && 'text-muted-foreground',
                i > step && 'text-muted-foreground/50'
              )}
            >
              {i < step ? (
                <CheckCircle2 className="size-4 text-primary" aria-hidden />
              ) : i === step ? (
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
              ) : (
                <span className="size-4 rounded-full border" aria-hidden />
              )}
              {s}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">{t('workingHint')}</p>
      </div>
    </AppCard>
  )
}

/** Nothing specific found: said plainly, nothing saved, and the way to help instead. */
function Missed({ item, subject }: { item: FaultCodeResearch; subject: string }) {
  const t = useTranslations('faultCodes.research')
  const { formatDate } = useFormatDate()
  return (
    <AppCard icon={SearchX} title={t('missedTitle')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">{t('missed', { code: subject })}</p>
          <p className="text-xs text-muted-foreground">
            {t('searchedOn', { date: formatDate(item.createdAt) })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() =>
            document.getElementById('share-fix')?.scrollIntoView({ behavior: 'smooth' })
          }
        >
          {t('shareInstead')}
        </Button>
      </div>
    </AppCard>
  )
}

/** What was found, laid out like the page: meaning, issues, steps, causes, advice, sources. */
function Findings({ item }: { item: FaultCodeResearch }) {
  const t = useTranslations('faultCodes.research')
  const tc = useTranslations('faultCodes')
  const f = item.findings
  const [vote, setVote] = useState<boolean | null>(null)
  if (!f) return null
  const checked = item.status === 'published'
  const causes = [...f.causes].sort(
    (a, b) => LIKELIHOOD_RANK[a.likelihood] - LIKELIHOOD_RANK[b.likelihood]
  )
  const rate = async (helpful: boolean) => {
    setVote(helpful)
    track('fault_code:research_rate', { code: item.code, helpful })
    const result = await rateFaultCodeResearch({ id: item.id, helpful })
    if (!result.success || !result.data?.rated) {
      setVote(null)
      toast.error(t('errors.failed'))
    }
  }
  const heading = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

  return (
    <AppCard
      icon={Sparkles}
      title={t('title')}
      action={
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            checked
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          )}
        >
          {checked && <ShieldCheck className="size-3" aria-hidden />}
          {checked ? t('published') : t('pending')}
        </span>
      }
      contentClassName="space-y-5"
    >
      <div className="space-y-1.5">
        <p className="font-medium">{f.title}</p>
        <p className="max-w-[88ch] text-sm leading-7 text-foreground/90">{f.meaning}</p>
        {!checked && <p className="text-xs text-muted-foreground">{t('pendingHint')}</p>}
      </div>

      {f.commonIssues.length > 0 && (
        <section className="space-y-1.5 border-l-2 border-primary/30 pl-4">
          <h4 className={heading}>{tc('sections.common_issues')}</h4>
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {f.commonIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-1.5 border-l-2 border-primary/30 pl-4">
        <h4 className={heading}>{tc('sections.resolution')}</h4>
        <ol className="space-y-2 text-sm">
          {f.steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {i + 1}
              </span>
              <span className="leading-6">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {causes.length > 0 && (
        <section className="space-y-2 border-l-2 border-primary/30 pl-4">
          <h4 className={heading}>{tc('detail.likelyCauses')}</h4>
          <ul className="space-y-1.5">
            {causes.map((cause) => (
              <li key={cause.label} className="flex items-start gap-3">
                <Likelihood level={cause.likelihood} />
                <span className="min-w-0 flex-1 text-sm">{cause.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {f.advice && (
        <section className="space-y-1.5 border-l-2 border-primary/30 pl-4">
          <h4 className={heading}>{tc('sections.advisory')}</h4>
          <p className="text-sm">{f.advice}</p>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-card-edge pt-4">
        <span className="text-xs text-muted-foreground">{t('sources')}</span>
        {f.sources.map((src) => (
          <a
            key={src.url}
            href={src.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={src.title ?? src.url}
            className="inline-flex items-center gap-1 rounded-md border border-card-edge bg-muted/40 px-1.5 py-0.5 text-xs hover:border-primary/40 hover:text-primary"
          >
            {hostOf(src.url)}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {vote === null ? t('helpfulQuestion') : t('thanks')}
          <Button
            type="button"
            variant={vote === true ? 'default' : 'outline'}
            size="icon-sm"
            aria-label={t('helpfulYes')}
            aria-pressed={vote === true}
            onClick={() => rate(true)}
          >
            <ThumbsUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant={vote === false ? 'default' : 'outline'}
            size="icon-sm"
            aria-label={t('helpfulNo')}
            aria-pressed={vote === false}
            onClick={() => rate(false)}
          >
            <ThumbsDown className="size-3.5" />
          </Button>
        </span>
      </div>
    </AppCard>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
