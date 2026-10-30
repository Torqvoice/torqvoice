'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, History, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { handleGated } from '@/components/upgrade-gate'
import { listBackupSnapshots } from '@/features/integrations/Actions/listBackupSnapshots'
import { restoreBackupSnapshot } from '@/features/integrations/Actions/restoreBackupSnapshot'
import { formatBytes } from '@/features/integrations/Lib/format-bytes'

const snapshotSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  time: z.string(),
  bytes: z.number().nullable(),
  files: z.boolean(),
  trigger: z.enum(['scheduled', 'manual']).nullable(),
  thisWorkshop: z.boolean(),
})

const listSchema = z.object({
  workshopName: z.string(),
  snapshots: z.array(snapshotSchema),
})

type Snapshot = z.infer<typeof snapshotSchema>

/**
 * The Restore section of the Backups card: the snapshots at the destination,
 * read when the person asks for them, and a dialog that puts one back after
 * the workshop's name has been typed. Only owners and administrators see it.
 * While a backup or restore runs nothing here can be started.
 */
export function BackupRestoreSection({
  connectorId,
  busy,
}: {
  connectorId: string
  /** A backup or restore is queued or running for this destination. */
  busy: boolean
}) {
  const t = useTranslations('integrations.connection.backup.restore')
  const tc = useTranslations('integrations')
  const format = useFormatter()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<Snapshot | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [starting, setStarting] = useState(false)

  const list = useQuery({
    queryKey: ['backup-snapshots', connectorId],
    queryFn: async () => {
      const res = await listBackupSnapshots(connectorId)
      if (!res.success) {
        handleGated(res)
        throw new Error(errorText(res.error))
      }
      return listSchema.parse(res.data)
    },
    enabled: open,
    staleTime: 60_000,
  })

  // A refusal comes back as a key under errors (restoreOwnerOnly, restoreBusy).
  const errorText = (error: string | undefined) =>
    error && tc.has(`errors.${error}`) ? tc(`errors.${error}`) : error || tc('errors.generic')

  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' })

  const close = () => {
    setChosen(null)
    setConfirmName('')
  }

  const workshopName = list.data?.workshopName ?? ''
  const confirmed = workshopName.trim().length > 0 && confirmName.trim() === workshopName.trim()

  const restore = async () => {
    if (!chosen || !confirmed) return
    setStarting(true)
    try {
      const res = await restoreBackupSnapshot({
        connectorId,
        snapshotId: chosen.id,
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

  const snapshots = list.data?.snapshots ?? []
  const trigger = (s: Snapshot) => (s.trigger ? tc(`connection.backup.trigger.${s.trigger}`) : '-')
  const files = (s: Snapshot) => (s.files ? t('filesIncluded') : t('filesNotIncluded'))
  const size = (s: Snapshot) => (s.bytes == null ? '-' : formatBytes(s.bytes))

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t('title')}</p>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </div>
        {open ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => list.refetch()}
            disabled={list.isFetching}
          >
            {list.isFetching ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            {t('refresh')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <History className="mr-1 h-3.5 w-3.5" />
            {t('show')}
          </Button>
        )}
      </div>

      {open && list.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('loading')}
        </p>
      )}
      {open && list.isError && (
        <p className="text-sm text-destructive">
          {t('loadFailed')}: {list.error.message}
        </p>
      )}
      {open && list.isSuccess && snapshots.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      )}
      {open && list.isSuccess && snapshots.length > 0 && (
        <>
          {/* Phones and portrait tablets get one card per backup. */}
          <div className="space-y-2 md:hidden">
            {snapshots.map((s) => (
              <div key={s.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {when(s.time)}
                    {!s.thisWorkshop && <EarlierInstall />}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setChosen(s)}
                    disabled={busy}
                  >
                    {t('action')}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {trigger(s)} · {files(s)} · {size(s)}
                </p>
              </div>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.taken')}</TableHead>
                  <TableHead>{t('columns.trigger')}</TableHead>
                  <TableHead>{t('columns.files')}</TableHead>
                  <TableHead className="text-right">{t('columns.size')}</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="font-medium">{when(s.time)}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {s.shortId}
                      </span>
                      {!s.thisWorkshop && <EarlierInstall />}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{trigger(s)}</TableCell>
                    <TableCell className="text-muted-foreground">{files(s)}</TableCell>
                    <TableCell className="text-right tabular-nums">{size(s)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setChosen(s)}
                        disabled={busy}
                      >
                        {t('action')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Replacing the whole workshop lives behind a dialog, like the upload under Settings, Data. */}
      <Dialog
        open={chosen !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !starting) close()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {chosen ? t('dialogTitle', { time: when(chosen.time) }) : t('title')}
            </DialogTitle>
            <DialogDescription>{t('secretsNote')}</DialogDescription>
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
    </div>
  )
}

/** A snapshot another install of this workshop took, found in the same repository. */
function EarlierInstall() {
  const t = useTranslations('integrations.connection.backup.restore')
  return (
    <Badge variant="outline" className="ml-2 text-[11px] font-normal text-muted-foreground">
      {t('earlierInstall')}
    </Badge>
  )
}
