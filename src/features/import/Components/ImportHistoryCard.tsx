'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { FileSpreadsheet, History, Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
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
  const confirm = useConfirm()
  // The import being undone; its button waits while the answer is out.
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await listImportBatches()
    if (res.success && res.data) setBatches(res.data)
    else setBatches([])
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const undo = async (batch: Batch) => {
    const ok = await confirm({
      title: t('confirmTitle'),
      description: t('confirmDescription', {
        file: batch.fileName,
        customers: batch.attached.customers,
        vehicles: batch.attached.vehicles,
        services: batch.attached.serviceRecords,
      }),
      subject: [{ label: batch.fileName, detail: te(batch.entity), icon: FileSpreadsheet }],
      confirmLabel: t('confirm'),
      cancelLabel: t('cancel'),
      icon: Undo2,
      // Undoing deletes what the import created, so it reads and focuses
      // like any other delete.
      destructive: true,
    })
    if (!ok) return
    setBusyId(batch.id)
    const res = await undoImportBatch(batch.id)
    setBusyId(null)
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
                  onClick={() => undo(b)}
                  disabled={busyId !== null}
                  aria-label={t('undo')}
                  title={t('undo')}
                >
                  {busyId === b.id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Undo2 className="mr-1 h-3.5 w-3.5" />
                  )}
                  {t('undo')}
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </AppCard>
  )
}
