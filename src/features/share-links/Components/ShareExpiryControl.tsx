'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, ClockAlert, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ShareKind } from '@/lib/share-expiry'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { getShareLinkExpiry } from '../Actions/getShareLinkExpiry'
import { setShareLinkExpiry } from '../Actions/setShareLinkExpiry'
import { type ShareExpiryView, shareExpiryViewSchema } from '../Schema/shareLinkSchema'

type Choice = 'workshop' | 'date' | 'never'

const CHOICES: Choice[] = ['workshop', 'date', 'never']

/** What the link says about itself today, as one of the three choices. */
function choiceOf(view: ShareExpiryView): Choice {
  if (view.source === 'workshop') return 'workshop'
  return view.kind === 'never' ? 'never' : 'date'
}

/** The sentence for where a link stands: "Expires 14 Dec 2026", "Stays open until paid". */
export function useShareExpiryText() {
  const t = useTranslations('common.shareLink.expiry')
  const { formatDate } = useFormatDate()
  return (view: ShareExpiryView): string => {
    if (view.kind === 'never') return t('never')
    if (view.kind === 'untilPaid') return t('untilPaid')
    const date = view.at ? formatDate(view.at) : ''
    return view.expired ? t('expired', { date }) : t('expires', { date })
  }
}

/**
 * The form behind "Change": follow the workshop's setting, pick a day, or
 * never expire. Saves on its button and hands back where the link now stands.
 */
function ShareExpiryForm({
  kind,
  id,
  view,
  onSaved,
  onCancel,
}: {
  kind: ShareKind
  id: string
  view: ShareExpiryView
  onSaved: (view: ShareExpiryView) => void
  onCancel: () => void
}) {
  const t = useTranslations('common.shareLink.expiry')
  const groupId = useId()
  const [choice, setChoice] = useState<Choice>(choiceOf(view))
  const [date, setDate] = useState(view.dateInput)
  const [saving, setSaving] = useState(false)

  const ruleText =
    view.rule.mode === 'never'
      ? t('rule.never')
      : t(`rule.${view.rule.mode}`, { days: view.rule.days })

  const save = async () => {
    if (choice === 'date' && !date) {
      toast.error(t('chooseDate'))
      return
    }
    setSaving(true)
    const result = await setShareLinkExpiry({
      kind,
      id,
      choice,
      date: choice === 'date' ? date : undefined,
    }).catch(() => null)
    setSaving(false)
    if (!result?.success || !result.data) {
      toast.error(result?.error || t('saveFailed'))
      return
    }
    onSaved(shareExpiryViewSchema.parse(result.data))
  }

  return (
    <div className="space-y-3">
      <p id={groupId} className="text-sm font-semibold">
        {t('formTitle')}
      </p>
      <div role="radiogroup" aria-labelledby={groupId} className="space-y-1">
        {CHOICES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={choice === option}
            onClick={() => setChoice(option)}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm transition-colors',
              choice === option
                ? 'border-primary/50 bg-primary/5'
                : 'border-transparent hover:bg-muted'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                choice === option ? 'border-primary' : 'border-muted-foreground/50'
              )}
            >
              {choice === option && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{t(`choice.${option}`)}</span>
              {option === 'workshop' && (
                <span className="block text-xs text-muted-foreground">{ruleText}</span>
              )}
            </span>
          </button>
        ))}
      </div>
      {choice === 'date' && (
        <div className="space-y-1 pl-1">
          <DateInput value={date} onChange={setDate} />
          <p className="text-xs text-muted-foreground">{t('dateHint')}</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {t('cancel')}
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t('save')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Where a link stands, with "Change" (or "Open again" once it has expired).
 * Given the answer it shows it; the card version below fetches its own.
 */
export function ShareExpiryControl({
  kind,
  id,
  view,
  onChanged,
  className,
}: {
  kind: ShareKind
  id: string
  view: ShareExpiryView
  onChanged: (view: ShareExpiryView) => void
  className?: string
}) {
  const t = useTranslations('common.shareLink.expiry')
  const text = useShareExpiryText()
  const [open, setOpen] = useState(false)
  const [reopening, setReopening] = useState(false)

  const reopen = async () => {
    setReopening(true)
    const result = await setShareLinkExpiry({ kind, id, choice: 'workshop' }).catch(() => null)
    setReopening(false)
    if (!result?.success || !result.data) {
      toast.error(result?.error || t('saveFailed'))
      return
    }
    const next = shareExpiryViewSchema.parse(result.data)
    onChanged(next)
    toast.success(t('reopened'))
  }

  const Icon = view.expired ? ClockAlert : Clock

  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5',
          view.expired ? 'font-medium text-destructive' : 'text-muted-foreground'
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {text(view)}
      </span>
      {view.expired && (
        <button
          type="button"
          onClick={reopen}
          disabled={reopening}
          className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
        >
          {t('openAgain')}
        </button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {t('change')}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <ShareExpiryForm
            kind={kind}
            id={id}
            view={view}
            onCancel={() => setOpen(false)}
            onSaved={(next) => {
              setOpen(false)
              onChanged(next)
              toast.success(t('saved'))
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * The line on a document's shared link card. It asks the server where the
 * link stands, and shows nothing while it does not know: a card that cannot
 * load its expiry still copies and revokes the link.
 */
export function ShareExpiryLine({
  kind,
  id,
  token,
}: {
  kind: ShareKind
  id: string
  /** The link itself, so a link made after a revoke is asked about afresh. */
  token: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const queryKey = ['share-link-expiry', kind, id, token]
  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await getShareLinkExpiry({ kind, id })
      if (!res.success) throw new Error(res.error)
      return shareExpiryViewSchema.parse(res.data)
    },
    staleTime: 30_000,
    retry: false,
  })

  if (!data) return null
  return (
    <ShareExpiryControl
      kind={kind}
      id={id}
      view={data}
      onChanged={(next) => {
        queryClient.setQueryData(queryKey, next)
        router.refresh()
      }}
    />
  )
}
