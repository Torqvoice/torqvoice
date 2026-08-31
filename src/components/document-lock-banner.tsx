'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Lock, LockOpen, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-dialog'
import type { LockState } from '@/lib/document-lock'

/**
 * Says why a document cannot be edited, and offers the way out to the people
 * who have one.
 *
 * The server refuses the edit either way, so this exists to stop someone
 * discovering the lock only after retyping a line. It names the rule that
 * applied and what still works, because "you cannot edit this" with no reason
 * reads as a fault rather than a policy.
 */
export function DocumentLockBanner({
  state,
  kind,
  canUnlock,
  onSetUnlocked,
}: {
  state: LockState
  kind: 'invoice' | 'quote'
  /** Owners and admins only; everyone else is told who to ask. */
  canUnlock: boolean
  onSetUnlocked: (unlocked: boolean) => Promise<{ success: boolean; error?: string }>
}) {
  const t = useTranslations('documentLock')
  const router = useRouter()
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  const run = async (unlocked: boolean) => {
    if (unlocked) {
      const ok = await confirm({
        title: t('unlockConfirmTitle'),
        description: t(`unlockConfirmDescription.${kind}`),
        confirmLabel: t('unlock'),
      })
      if (!ok) return
    }
    setBusy(true)
    const result = await onSetUnlocked(unlocked)
    setBusy(false)
    if (!result.success) {
      toast.error(result.error || t('failed'))
      return
    }
    toast.success(unlocked ? t('unlocked') : t('relocked'))
    startTransition(() => router.refresh())
  }

  const working = busy || isPending

  // Reopened by an admin: a quieter note, since nothing is being blocked.
  if (!state.locked && state.unlockedAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <LockOpen className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium">{t('reopenedTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('reopenedBody')}</p>
          </div>
        </div>
        {canUnlock && (
          <Button variant="outline" size="sm" disabled={working} onClick={() => run(false)}>
            {working ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Lock className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t('relock')}
          </Button>
        )}
      </div>
    )
  }

  if (!state.locked || !state.reason) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{t(`lockedTitle.${kind}.${state.reason}`)}</p>
          <p className="text-xs text-muted-foreground">{t('lockedBody')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canUnlock ? t('lockedAdminHint') : t('lockedMemberHint')}
          </p>
        </div>
      </div>
      {canUnlock && (
        <Button variant="outline" size="sm" disabled={working} onClick={() => run(true)}>
          {working ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <LockOpen className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t('unlock')}
        </Button>
      )}
    </div>
  )
}
