'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { History, Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { listImportBatches, undoImportBatch } from '@/features/import/Actions/importActions'

type Batch = NonNullable<Awaited<ReturnType<typeof listImportBatches>>['data']>[number]

/**
 * Every spreadsheet import the workshop has run, with an undo for the ones
 * that can still be undone. Lives under Settings → Data next to the
 * importer itself.
 */
export function ImportHistoryCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const t = useTranslations('dataImport.history')
  const te = useTranslations('dataImport.entities')
  const format = useFormatter()
  const router = useRouter()
  const [batches, setBatches] = useState<Batch[] | null>(null)
  const [pending, setPending] = useState<Batch | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await listImportBatches()
    if (res.success && res.data) setBatches(res.data)
    else setBatches([])
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const undo = async () => {
    if (!pending) return
    setBusy(true)
    const res = await undoImportBatch(pending.id)
    setBusy(false)
    setPending(null)
    if (res.success && res.data) {
      toast.success(
        t('undone', {
          customers: res.data.customers,
          vehicles: res.data.vehicles,
          services: res.data.serviceRecords,
        })
      )
      router.refresh()
      load()
    } else {
      toast.error(res.error || t('undoFailed'))
    }
  }

  if (batches === null) {
    return (
      <AppCard icon={History} title={t('title')}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      </AppCard>
    )
  }

  if (batches.length === 0) return null

  return (
    <AppCard icon={History} title={t('title')} description={t('description')}>
      <div className="divide-y">
        {batches.map((b) => {
          const attached = b.attached.customers + b.attached.vehicles + b.attached.serviceRecords
          return (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{b.fileName}</span>
                  <Badge variant="outline" className="text-xs">
                    {te(b.entity)}
                  </Badge>
                  {b.status === 'undone' && (
                    <Badge variant="secondary" className="text-xs">
                      {t('statusUndone')}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {format.dateTime(new Date(b.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {' · '}
                  {t('counts', {
                    created: b.created,
                    updated: b.updated,
                    skipped: b.skipped,
                    failed: b.failed,
                  })}
                </div>
              </div>
              {b.status === 'completed' && attached > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setPending(b)}
                  aria-label={t('undo')}
                  title={t('undo')}
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" />
                  {t('undo')}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !busy && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending &&
                t('confirmDescription', {
                  file: pending.fileName,
                  customers: pending.attached.customers,
                  vehicles: pending.attached.vehicles,
                  services: pending.attached.serviceRecords,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={undo} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppCard>
  )
}
