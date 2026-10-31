'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { AlertTriangle, History, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ReauthField } from '@/app/(authenticated)/settings/data/reauth-field'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { handleGated } from '@/components/upgrade-gate'
import { restorePlatformSnapshot } from '@/features/integrations/Actions/restorePlatformSnapshot'
import { useActionErrorText } from '@/features/integrations/Hooks/useBackupSnapshots'
import type { PlatformSnapshotView } from '@/features/integrations/Lib/backup-types'
import { type ReauthRequirement, reauthErrorMessageKey } from '@/lib/reauth'

/**
 * Puts the workshop back to one of its restore points in the platform
 * repository. Confirmed the way deleting the workshop is: the warning, the
 * workshop's name typed in full, and the password or two-factor code the
 * account has. The restore runs in the background; the card follows it.
 */
export function PlatformRestoreDialog({
  workshopName,
  reauth,
  target,
  onClose,
}: {
  workshopName: string
  reauth: ReauthRequirement
  /** The restore point to go back to; null keeps the dialog closed. */
  target: PlatformSnapshotView | null
  onClose: () => void
}) {
  const t = useTranslations('settings.data.platformBackups.restore')
  const format = useFormatter()
  const router = useRouter()
  const errorText = useActionErrorText()
  const [confirmName, setConfirmName] = useState('')
  const [reauthValue, setReauthValue] = useState('')
  const [reauthError, setReauthError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const confirmed = workshopName.trim().length > 0 && confirmName.trim() === workshopName.trim()
  const reauthReady = reauth === 'none' || reauthValue.trim() !== ''

  const close = () => {
    setConfirmName('')
    setReauthValue('')
    setReauthError(null)
    onClose()
  }

  const restore = async () => {
    if (!target || !confirmed || !reauthReady) return
    setStarting(true)
    setReauthError(null)
    try {
      const res = await restorePlatformSnapshot({
        snapshotId: target.id,
        confirmName,
        ...(reauth === 'password'
          ? { password: reauthValue }
          : reauth === 'totp'
            ? { totpCode: reauthValue }
            : {}),
      })
      if (!res.success) {
        // A refused password or code belongs next to the field it is about.
        if (reauthErrorMessageKey(res.error)) setReauthError(res.error ?? null)
        else if (!handleGated(res)) toast.error(errorText(res.error))
        return
      }
      toast.success(t('started'))
      close()
      router.refresh()
    } finally {
      setStarting(false)
    }
  }

  const when = target
    ? format.dateTime(new Date(target.time), { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen && !starting) close()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('dialogTitle', { time: when })}
          </DialogTitle>
          <DialogDescription>{t('untouched')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t.rich('warning', { time: when, bold: (chunks) => <strong>{chunks}</strong> })}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{t('safetyNote')}</p>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">
              {t.rich('confirmPrompt', {
                name: workshopName,
                bold: (chunks) => <span className="font-mono font-bold">{chunks}</span>,
              })}
            </p>
          </div>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={workshopName}
            autoComplete="off"
          />
          <ReauthField
            id="platform-restore-reauth"
            requirement={reauth}
            value={reauthValue}
            onChange={setReauthValue}
            onSubmit={restore}
            error={reauthError}
          />
          <p className="text-xs text-muted-foreground">{t('whileRunning')}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={close} disabled={starting}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={restore}
              disabled={!confirmed || !reauthReady || starting}
            >
              {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('confirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
