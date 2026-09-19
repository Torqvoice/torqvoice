'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  AlertCircle,
  Building2,
  Car,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  MinusCircle,
  Upload,
  User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import type { DateFormat } from '@/features/import/Lib/normalize'
import {
  MAX_REMINDER_IMPORT_BYTES,
  MAX_REMINDER_IMPORT_ROWS,
  REMINDER_COLUMNS,
  type ReminderImportFileError,
} from '../Lib/reminderImport'
import {
  importReminders,
  previewReminderImport,
  type ReminderImportPreviewRow,
} from '../Actions/reminderImportActions'

interface ReminderImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  unitSystem: 'metric' | 'imperial'
}

type Preview = {
  fileName: string
  dateFormat: DateFormat
  columns: string[]
  ignoredColumns: string[]
  rows: ReminderImportPreviewRow[]
}

type Step = 'upload' | 'preview' | 'done'

/** Skipped rows as they were, plus why, so the file can be fixed and uploaded again. */
function downloadSkipped(
  preview: Preview,
  problemHeader: string,
  problem: (row: ReminderImportPreviewRow) => string
) {
  const quote = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [[...preview.columns, problemHeader]]
  for (const row of preview.rows) {
    if (row.status !== 'ready' && row.raw) lines.push([...row.raw, problem(row)])
  }
  const csv = `﻿${lines.map((l) => l.map(quote).join(',')).join('\r\n')}\r\n`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${preview.fileName.replace(/\.[^.]+$/, '')}-skipped.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ReminderImportDialog({
  open,
  onOpenChange,
  unitSystem,
}: ReminderImportDialogProps) {
  const t = useTranslations('reminders.import')
  const tr = useTranslations('reminders')
  const to = useTranslations('dataImport.options')
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const distUnit = unitSystem === 'metric' ? 'km' : 'mi'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  const reset = () => {
    setStep('upload')
    setFile(null)
    setPreview(null)
    setError(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleOpenChange = (next: boolean) => {
    if (busy) return
    onOpenChange(next)
    if (!next) reset()
  }

  const fileErrorMessage = (code: ReminderImportFileError, limit?: number) =>
    t(`fileErrors.${code}`, { limit: limit ?? MAX_REMINDER_IMPORT_ROWS })

  const formFor = (f: File, dateFormat: DateFormat) => {
    const form = new FormData()
    form.set('file', f)
    form.set('dateFormat', dateFormat)
    return form
  }

  const runPreview = async (f: File, dateFormat: DateFormat) => {
    setError(null)
    if (f.size > MAX_REMINDER_IMPORT_BYTES) {
      setError(fileErrorMessage('tooLarge'))
      return
    }
    setBusy(true)
    try {
      const res = await previewReminderImport(formFor(f, dateFormat))
      if (!res.success || !res.data) {
        setError(res.error ?? t('fileErrors.unreadable'))
        return
      }
      if (res.data.fileError) {
        setError(fileErrorMessage(res.data.fileError, res.data.limit))
        return
      }
      setFile(f)
      setPreview(res.data)
      setStep('preview')
    } catch {
      setError(t('fileErrors.unreadable'))
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    if (!file || !preview) return
    setBusy(true)
    setError(null)
    try {
      const res = await importReminders(formFor(file, preview.dateFormat))
      if (!res.success || !res.data) {
        setError(res.error ?? t('fileErrors.unreadable'))
        return
      }
      if (res.data.fileError) {
        setError(fileErrorMessage(res.data.fileError, res.data.limit))
        return
      }
      setResult({ created: res.data.created, skipped: res.data.skipped })
      setStep('done')
      router.refresh()
    } catch {
      setError(t('fileErrors.unreadable'))
    } finally {
      setBusy(false)
    }
  }

  const problem = (row: ReminderImportPreviewRow) =>
    row.issue ? t(`issues.${row.issue}`, { value: row.issueValue ?? '' }) : ''

  const ready = preview?.rows.filter((r) => r.status === 'ready').length ?? 0
  const duplicates = preview?.rows.filter((r) => r.status === 'duplicate').length ?? 0
  const errors = preview?.rows.filter((r) => r.status === 'error').length ?? 0

  const dueLabel = (row: ReminderImportPreviewRow) => {
    const parts: string[] = []
    if (row.dueDay) {
      // Noon UTC stays on its calendar day in every workshop zone.
      const day = formatDate(new Date(`${row.dueDay}T12:00:00Z`))
      parts.push(row.dueTime ? `${day} ${row.dueTime}` : day)
    }
    if (row.dueMileage != null) parts.push(`${row.dueMileage.toLocaleString()} ${distUnit}`)
    return parts.join(' · ')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Upload ─────────────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
            <div
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const dropped = e.dataTransfer.files[0]
                if (dropped && !busy) runPreview(dropped, 'auto')
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('reading')}</p>
                </>
              ) : (
                <>
                  <FileUp className="h-9 w-9 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">{t('drop')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('formats', { rows: MAX_REMINDER_IMPORT_ROWS })}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {t('browse')}
                  </Button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xlsm"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0]
                  e.target.value = ''
                  if (picked) runPreview(picked, 'auto')
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4 shrink-0" />
                {t('templateHint')}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <a href="/api/protected/reminders/template?format=xlsx" download>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    {t('templateXlsx')}
                  </a>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href="/api/protected/reminders/template?format=csv" download>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    {t('templateCsv')}
                  </a>
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('columnsTitle')}</p>
              <div className="divide-y rounded-lg border text-sm">
                {REMINDER_COLUMNS.map((c) => (
                  <div
                    key={c.key}
                    className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_8rem_1fr] sm:items-baseline sm:gap-3"
                  >
                    <code className="font-mono text-xs font-medium">{c.header}</code>
                    <span
                      className={cn(
                        'text-xs',
                        c.required === 'no' ? 'text-muted-foreground' : 'font-medium'
                      )}
                    >
                      {t(`required.${c.required}`)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(`columns.${c.key}`, { unit: distUnit })}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t('targetRule')}</p>
            </div>
          </div>
        )}

        {/* ── Preview ────────────────────────────────────────────────────── */}
        {step === 'preview' && preview && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1 text-sm">
                <p className="font-medium">{preview.fileName}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{t('summary.ready', { count: ready })}</Badge>
                  {duplicates > 0 && (
                    <Badge variant="outline">
                      {t('summary.duplicates', { count: duplicates })}
                    </Badge>
                  )}
                  {errors > 0 && (
                    <Badge variant="destructive">{t('summary.errors', { count: errors })}</Badge>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{to('dateFormat')}</Label>
                <Select
                  value={preview.dateFormat}
                  disabled={busy}
                  onValueChange={(v) => file && runPreview(file, v as DateFormat)}
                >
                  <SelectTrigger className="h-8 w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{to('dateAuto')}</SelectItem>
                    <SelectItem value="DMY">{to('dateDMY')}</SelectItem>
                    <SelectItem value="MDY">{to('dateMDY')}</SelectItem>
                    <SelectItem value="YMD">{to('dateYMD')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {preview.ignoredColumns.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('ignoredColumns', { columns: preview.ignoredColumns.join(', ') })}
              </p>
            )}

            <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded-lg border">
              {preview.rows.map((row) => (
                <div key={row.line} className="flex items-start gap-3 px-3 py-2 text-sm">
                  {row.status === 'ready' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : row.status === 'duplicate' ? (
                    <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {t('rowLabel', { line: row.line })}
                      </span>
                      <span
                        className={cn(
                          'truncate font-medium',
                          !row.title && 'text-muted-foreground'
                        )}
                      >
                        {row.title ?? t('untitled')}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {row.target && (
                        <span className="flex items-center gap-1">
                          {row.target.kind === 'vehicle' ? (
                            <Car className="h-3 w-3" />
                          ) : row.target.kind === 'customer' ? (
                            <User className="h-3 w-3" />
                          ) : (
                            <Building2 className="h-3 w-3" />
                          )}
                          {row.target.kind === 'workshop'
                            ? tr('workshopReminder')
                            : row.target.label}
                        </span>
                      )}
                      {dueLabel(row) && <span>{dueLabel(row)}</span>}
                    </div>
                    {row.issue && (
                      <p
                        className={cn(
                          'mt-0.5 text-xs',
                          row.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                        )}
                      >
                        {problem(row)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Done ───────────────────────────────────────────────────────── */}
        {step === 'done' && result && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <p className="font-medium">{t('done', { count: result.created })}</p>
            {result.skipped > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('doneSkipped', { count: result.skipped })}
              </p>
            )}
          </div>
        )}

        {step !== 'upload' && (
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {step === 'preview' && (
                <Button variant="ghost" onClick={reset} disabled={busy}>
                  {t('chooseAnother')}
                </Button>
              )}
              {preview && duplicates + errors > 0 && (
                <Button
                  variant="outline"
                  onClick={() => downloadSkipped(preview, t('problemColumn'), problem)}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  {t('downloadSkipped')}
                </Button>
              )}
            </div>
            {step === 'preview' ? (
              <Button onClick={runImport} disabled={busy || ready === 0}>
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {ready === 0 ? t('nothingToImport') : t('submit', { count: ready })}
              </Button>
            ) : (
              <Button onClick={() => handleOpenChange(false)}>{t('close')}</Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
