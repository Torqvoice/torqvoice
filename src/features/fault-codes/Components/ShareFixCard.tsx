'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Share2, Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { useConfirm } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { withdrawFaultCodeFix } from '../Actions/withdrawFaultCodeFix'
import type { CodeVehicle, OwnFix } from '../Lib/types'
import { FixPhotos, fixVehicleLine } from './FixPhotos'
import { FixText } from './FixText'
import { ShareFixDialog } from './ShareFixDialog'

/**
 * "Share your fix" on a code's page, in the main column: an invitation to
 * tell other workshops what fixed the code, this workshop's fixes with how
 * their review stands, and the dialog the fix is written in. Fixes go to
 * Torqvoice Codes, where a person checks each one before others see it.
 */
export function ShareFixCard({
  code,
  label = code,
  meaning = null,
  makes = null,
  vehicle,
  own: initialOwn,
  available,
}: {
  code: string
  /** The code as people read it ("BMW 283700"); the code itself otherwise. */
  label?: string
  /** For a make's own code, the meaning on screen: fixes are shared for it and listed by it. */
  meaning?: { id: string; title: string } | null
  /** The makes the code is on, for the share dialog's make. */
  makes?: string[] | null
  vehicle: CodeVehicle | null
  own: OwnFix[]
  /** The service answered when the page was read. */
  available: boolean
}) {
  const t = useTranslations('faultCodes.share')
  const confirm = useConfirm()
  const { formatDate } = useFormatDate()
  const [allOwn, setOwn] = useState<OwnFix[]>(initialOwn)
  // This workshop's fixes for the meaning on screen; one for the code as a whole shows under each.
  const own = meaning
    ? allOwn.filter((f) => f.meaning === null || f.meaning === meaning.id)
    : allOwn
  const [open, setOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)

  const withdraw = async (fix: OwnFix) => {
    const ok = await confirm({
      title: t('withdrawTitle'),
      description: t('withdrawConfirm'),
      confirmLabel: t('withdraw'),
      destructive: true,
    })
    if (!ok) return
    setWithdrawing(fix.id)
    const result = await withdrawFaultCodeFix({ code, id: fix.id })
    setWithdrawing(null)
    if (!result.success) {
      toast.error(t('withdrawFailed'))
      return
    }
    setOwn((current) => current.filter((f) => f.id !== fix.id))
    toast.success(t('withdrawn'))
  }

  const statusLabel: Record<OwnFix['status'], string> = {
    pending: t('status.pending'),
    published: t('status.published'),
    rejected: t('status.rejected'),
  }

  return (
    <AppCard
      icon={Share2}
      title={t('title')}
      description={t('description', { code: label })}
      action={
        available && own.length > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Share2 />
            {t('shareAnother')}
          </Button>
        ) : undefined
      }
      contentClassName="space-y-4"
    >
      {!available ? (
        <p className="text-sm text-muted-foreground">{t('unavailable')}</p>
      ) : own.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-border bg-muted/20 p-5 sm:flex-row sm:items-center">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wrench className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">{t('invite', { code: label })}</p>
            <p className="text-sm text-muted-foreground">{t('inviteHint')}</p>
          </div>
          <Button type="button" onClick={() => setOpen(true)} className="shrink-0">
            <Share2 />
            {t('start')}
          </Button>
        </div>
      ) : null}

      {own.length > 0 && (
        <ul className="space-y-3" aria-label={t('yourFixes', { code: label })}>
          {own.map((fix) => {
            const line = fixVehicleLine(fix.vehicle)
            return (
              <li key={fix.id} className="space-y-3 rounded-lg border border-card-edge p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      fix.status === 'published' && 'border-primary/40 bg-primary/10 text-primary',
                      fix.status === 'pending' && 'bg-muted text-muted-foreground',
                      fix.status === 'rejected' &&
                        'border-destructive/40 bg-destructive/10 text-destructive'
                    )}
                  >
                    {statusLabel[fix.status]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fix.edited
                      ? `${t('sentOn', { date: formatDate(fix.createdAt) })} · ${t('editedNote')}`
                      : t('sentOn', { date: formatDate(fix.createdAt) })}
                  </span>
                </div>
                {fix.status === 'rejected' && fix.reason && (
                  <p className="text-xs text-muted-foreground">
                    {t('reason', { reason: fix.reason })}
                  </p>
                )}
                <FixText text={fix.text} />
                {line && <p className="text-xs text-muted-foreground">{line}</p>}
                <FixPhotos fixId={fix.id} photos={fix.photos} />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    disabled={withdrawing === fix.id}
                    onClick={() => withdraw(fix)}
                  >
                    {withdrawing === fix.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    {t('withdraw')}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {available && (
        <ShareFixDialog
          open={open}
          onOpenChange={setOpen}
          code={code}
          label={label}
          meaning={meaning}
          makes={makes}
          vehicle={vehicle}
          onShared={(fix) => setOwn((current) => [fix, ...current])}
        />
      )}
    </AppCard>
  )
}
