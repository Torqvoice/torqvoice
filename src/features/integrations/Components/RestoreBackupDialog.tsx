'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { AlertTriangle, History, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { restoreBackupSnapshot } from '@/features/integrations/Actions/restoreBackupSnapshot'
import { useActionErrorText } from '@/features/integrations/Hooks/useBackupSnapshots'

/** The backup a row of the Backups card offers to put back. */
export interface RestoreTarget {
  snapshotId: string
  /** When it was taken, ISO 8601. */
  time: string
  /** Whether photos and files were in it, when known. */
  files: boolean | null
}

/**
 * Puts one backup back, after the warning and the workshop's name typed in
 * full, the way the upload under Settings, Data is confirmed. The restore
 * itself runs in the background; the card follows the run row.
 */
export function RestoreBackupDialog({
  connectorId,
  workshopName,
  target,
  onClose,
}: {
  connectorId: string
  workshopName: string
  /** The backup to restore; null keeps the dialog closed. */
  target: RestoreTarget | null
  onClose: () => void
}) {
  const t = useTranslations('integrations.connection.backup.restore')
  const format = useFormatter()
  const router = useRouter()
  const errorText = useActionErrorText()
  const [confirmName, setConfirmName] = useState('')
  const [starting, setStarting] = useState(false)

  const confirmed = workshopName.trim().length > 0 && confirmName.trim() === workshopName.trim()

  const close = () => {
    setConfirmName('')
    onClose()
  }

  const restore = async () => {
    if (!target || !confirmed) return
    setStarting(true)
    try {
      const res = await restoreBackupSnapshot({
        connectorId,
        snapshotId: target.snapshotId,
        confirmName,
      })
      if (!res.success) {
        if (!handleGated(res)) toast.error(errorText(res.error))
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
          <DialogDescription>
            {target?.files === true && `${t('filesIncluded')}. `}
            {target?.files === false && `${t('filesNotIncluded')}. `}
            {t('secretsNote')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t.rich('warning', { bold: (chunks) => <strong>{chunks}</strong> })}</span>
          </div>
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') void restore()
            }}
          />
          <p className="text-xs text-muted-foreground">{t('whileRunning')}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={close} disabled={starting}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={restore} disabled={!confirmed || starting}>
              {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('confirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
