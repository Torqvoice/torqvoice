'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  ArrowLeft,
  Car,
  Check,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Sparkles,
  Undo2,
  Upload,
  Users,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DocsLink } from '@/components/docs-link'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type CommitResult,
  type DryRunResult,
  type PlanPage,
  type RowFilter,
  type RowPlan,
  commitImport,
  dryRunImport,
  getImportPlanPage,
  getImportProgress,
  getImportReportCsv,
  suggestMappingWithAi,
  undoImportBatch,
} from '@/features/import/Actions/importActions'
import type { ImportEntity } from '@/features/import/Lib/fields'
import type { DateFormat, DecimalSeparator } from '@/features/import/Lib/normalize'
import type { DuplicateRule, RowAction, RowIssue } from '@/features/import/Lib/pipeline'
import type { ColumnMapping } from '@/features/import/Lib/suggest'
import { type AnalyzeResponse, IMPORT_ENTITIES, missingRequired } from '@/features/import/Lib/types'

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'result'

const IGNORE = '__ignore__'

const ENTITY_ICON: Record<ImportEntity, typeof Users> = {
  customers: Users,
  vehicles: Car,
  services: Wrench,
}

function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob([`﻿${text}`], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ImportWizard({
  open,
  onOpenChange,
  entity: initialEntity = 'customers',
  lockEntity = false,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity?: ImportEntity
  lockEntity?: boolean
  onImported?: () => void
}) {
  const t = useTranslations('dataImport')
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [entity, setEntity] = useState<ImportEntity>(initialEntity)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto')
  const [decimalSeparator, setDecimalSeparator] = useState<DecimalSeparator>('auto')
  const [countryCode, setCountryCode] = useState('')
  const [duplicates, setDuplicates] = useState<DuplicateRule>('update')
  const [overrides, setOverrides] = useState<Record<string, RowAction>>({})

  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [page, setPage] = useState<PlanPage | null>(null)
  const [filter, setFilter] = useState<RowFilter>('all')

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [undone, setUndone] = useState(false)

  const reset = useCallback(() => {
    setStep('upload')
    setEntity(initialEntity)
    setAnalysis(null)
    setMapping({})
    setOverrides({})
    setDryRun(null)
    setPage(null)
    setFilter('all')
    setProgress(null)
    setResult(null)
    setUndone(false)
    setBusy(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [initialEntity])

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next) {
        if (step === 'importing') return
        reset()
      }
      onOpenChange(next)
    },
    [onOpenChange, reset, step]
  )

  useEffect(() => {
    if (open) setEntity(initialEntity)
  }, [open, initialEntity])

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true)
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('entity', entity)
        const res = await fetch('/api/protected/import/analyze', { method: 'POST', body: form })
        const body = (await res.json()) as AnalyzeResponse & { error?: string }
        if (!res.ok) throw new Error(body.error || t('errors.uploadFailed'))
        setAnalysis(body)
        setMapping(body.suggestion.mapping)
        setDateFormat(body.suggestion.dateFormat)
        setDecimalSeparator(body.suggestion.decimalSeparator)
        setCountryCode(body.defaults.countryCode ?? '')
        setOverrides({})
        setStep('mapping')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('errors.uploadFailed'))
      } finally {
        setBusy(false)
      }
    },
    [entity, t]
  )

  // ── Mapping ───────────────────────────────────────────────────────────────

  const runInput = useMemo(
    () =>
      analysis
        ? {
            token: analysis.token,
            mapping,
            options: {
              entity,
              dateFormat,
              decimalSeparator,
              defaultCountryCode: countryCode.trim() || null,
              duplicates,
            },
            overrides,
          }
        : null,
    [analysis, mapping, entity, dateFormat, decimalSeparator, countryCode, duplicates, overrides]
  )

  const missing = useMemo(() => missingRequired(entity, mapping), [entity, mapping])

  const setColumn = (col: number, key: string) => {
    setMapping((prev) => {
      const next: ColumnMapping = {}
      for (const [c, k] of Object.entries(prev)) {
        // A field can only come from one column.
        if (k === key && c !== String(col)) continue
        next[c] = k
      }
      if (key === IGNORE) delete next[String(col)]
      else next[String(col)] = key
      return next
    })
  }

  const suggestWithAi = async () => {
    if (!analysis) return
    setBusy(true)
    const res = await suggestMappingWithAi(analysis.token)
    setBusy(false)
    if (!res.success || !res.data) {
      toast.error(res.error || t('errors.aiFailed'))
      return
    }
    setMapping(res.data.mapping)
    setDateFormat(res.data.dateFormat)
    setDecimalSeparator(res.data.decimalSeparator)
    toast.success(t('mapping.aiApplied', { count: Object.keys(res.data.mapping).length }))
  }

  const runDryRun = async (nextOverrides = overrides, nextFilter: RowFilter = 'all') => {
    if (!runInput) return
    setBusy(true)
    const res = await dryRunImport({ ...runInput, overrides: nextOverrides }, 0, nextFilter)
    setBusy(false)
    if (!res.success || !res.data) {
      toast.error(res.error || t('errors.dryRunFailed'))
      return
    }
    setDryRun(res.data)
    setPage(res.data.page)
    setFilter(nextFilter)
    setStep('preview')
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  const loadPage = async (pageIndex: number, nextFilter: RowFilter) => {
    if (!runInput) return
    setBusy(true)
    const res = await getImportPlanPage(runInput, pageIndex, nextFilter)
    setBusy(false)
    if (res.success && res.data) {
      setPage(res.data)
      setFilter(nextFilter)
    }
  }

  const setRowAction = async (index: number, action: RowAction) => {
    const next = { ...overrides, [String(index)]: action }
    setOverrides(next)
    // Re-plan so the summary and the shared-customer bookkeeping stay honest.
    if (!runInput) return
    const res = await dryRunImport({ ...runInput, overrides: next }, page?.page ?? 0, filter)
    if (res.success && res.data) {
      setDryRun(res.data)
      setPage(res.data.page)
    }
  }

  const downloadReport = async () => {
    if (!runInput) return
    setBusy(true)
    const res = await getImportReportCsv(runInput)
    setBusy(false)
    if (res.success && res.data) downloadText(res.data.fileName, res.data.csv)
    else toast.error(res.error || t('errors.dryRunFailed'))
  }

  // ── Commit ────────────────────────────────────────────────────────────────

  const runCommit = async () => {
    if (!runInput) return
    setStep('importing')
    setProgress({ done: 0, total: dryRun ? dryRun.summary.create + dryRun.summary.update : 0 })
    const token = runInput.token
    const poll = setInterval(async () => {
      const res = await getImportProgress(token)
      if (res.success && res.data) setProgress({ done: res.data.done, total: res.data.total })
    }, 800)
    try {
      const res = await commitImport(runInput)
      if (!res.success || !res.data) throw new Error(res.error || t('errors.importFailed'))
      setResult(res.data)
      setStep('result')
      router.refresh()
      onImported?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.importFailed'))
      setStep('preview')
    } finally {
      clearInterval(poll)
    }
  }

  const undo = async () => {
    if (!result) return
    setBusy(true)
    const res = await undoImportBatch(result.batchId)
    setBusy(false)
    if (res.success && res.data) {
      setUndone(true)
      toast.success(
        t('result.undone', {
          customers: res.data.customers,
          vehicles: res.data.vehicles,
          services: res.data.serviceRecords,
        })
      )
      router.refresh()
    } else {
      toast.error(res.error || t('errors.undoFailed'))
    }
  }

  // ── Rendering helpers ─────────────────────────────────────────────────────

  const fieldLabel = (key: string) => t(`fields.${key}`)
  const issueText = (issue: RowIssue) =>
    t(`issues.${issue.code}`, {
      value: issue.value ?? '',
      field: issue.field ? fieldLabel(issue.field) : '',
    })

  const groupsInOrder = useMemo(() => {
    if (!analysis) return []
    const order: Record<string, number> = { customer: 0, vehicle: 1, service: 2 }
    if (entity === 'vehicles') Object.assign(order, { vehicle: 0, customer: 1 })
    if (entity === 'services') Object.assign(order, { service: 0, vehicle: 1, customer: 2 })
    const groups = new Map<string, typeof analysis.fields>()
    for (const f of analysis.fields) {
      const list = groups.get(f.group) ?? []
      list.push(f)
      groups.set(f.group, list)
    }
    return [...groups.entries()].sort((a, b) => order[a[0]] - order[b[0]])
  }, [analysis, entity])

  const sampleFor = (col: number) =>
    (analysis?.sampleRows ?? [])
      .map((r) => r[col])
      .filter((v) => v?.trim())
      .slice(0, 3)

  const EntityIcon = ENTITY_ICON[entity]

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] !overflow-hidden sm:max-w-6xl flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EntityIcon className="h-5 w-5" />
            {t('title', { entity: t(`entities.${entity}`) })}
          </DialogTitle>
          <DialogDescription>{t(`steps.${step}`)}</DialogDescription>
          <DocsLink
            href="/docs/configuration/importing-data"
            variant="hint"
            className="self-start"
          />
        </DialogHeader>

        {/* ── Upload ─────────────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="space-y-4 overflow-y-auto">
            {!lockEntity && (
              <div className="grid gap-2 sm:grid-cols-3">
                {IMPORT_ENTITIES.map((e) => {
                  const Icon = ENTITY_ICON[e]
                  const active = e === entity
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEntity(e)}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                        active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{t(`entities.${e}`)}</p>
                        <p className="text-xs text-muted-foreground">{t(`entityHints.${e}`)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div
              className={`flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-10 transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const file = e.dataTransfer.files[0]
                if (file) handleFile(file)
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('upload.reading')}</p>
                </>
              ) : (
                <>
                  <FileUp className="h-10 w-10 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">{t('upload.drop')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('upload.formats')}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {t('upload.browse')}
                  </Button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xlsm,.vcf,.vcard"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                {t('upload.templateHint')}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <a href={`/api/protected/import/template?entity=${entity}&format=xlsx`} download>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    {t('upload.templateXlsx')}
                  </a>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={`/api/protected/import/template?entity=${entity}&format=csv`} download>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    {t('upload.templateCsv')}
                  </a>
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('upload.sourcesHint')}</p>
          </div>
        )}

        {/* ── Mapping ────────────────────────────────────────────────────── */}
        {step === 'mapping' && analysis && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span className="font-medium text-foreground">{analysis.fileName}</span>
                <span>{t('mapping.rows', { count: analysis.totalRows })}</span>
                {analysis.sheetName && <span>· {analysis.sheetName}</span>}
                {analysis.encoding && <span>· {analysis.encoding}</span>}
                {analysis.suggestion.presetId && (
                  <Badge variant="outline" className="text-xs">
                    {analysis.presets.find((p) => p.id === analysis.suggestion.presetId)?.name ??
                      analysis.suggestion.presetId}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                {analysis.aiAvailable && (
                  <Button variant="outline" size="sm" onClick={suggestWithAi} disabled={busy}>
                    {busy ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                    )}
                    {t('mapping.suggestWithAi')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={reset}>
                  {t('mapping.chooseAnother')}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%]">{t('mapping.colColumn')}</TableHead>
                    <TableHead>{t('mapping.colSample')}</TableHead>
                    <TableHead className="w-[30%]">{t('mapping.colField')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.columns.map((name, col) => {
                    const key = mapping[String(col)]
                    const source = analysis.suggestion.source[String(col)]
                    return (
                      <TableRow key={col}>
                        <TableCell className="align-top">
                          <div className="font-medium">{name}</div>
                          {key && source && key === analysis.suggestion.mapping[String(col)] && (
                            <div className="text-[11px] text-muted-foreground">
                              {t(`mapping.source.${source}`)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-xs text-muted-foreground">
                          {sampleFor(col).map((v, i) => (
                            <div key={i} className="max-w-[320px] truncate">
                              {v}
                            </div>
                          ))}
                        </TableCell>
                        <TableCell className="align-top">
                          <Select value={key ?? IGNORE} onValueChange={(v) => setColumn(col, v)}>
                            <SelectTrigger className={`h-8 ${key ? '' : 'text-muted-foreground'}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={IGNORE}>{t('mapping.ignore')}</SelectItem>
                              {groupsInOrder.map(([group, fields]) => (
                                <SelectGroup key={group}>
                                  <SelectLabel>{t(`groups.${group}`)}</SelectLabel>
                                  {fields.map((f) => (
                                    <SelectItem key={f.key} value={f.key}>
                                      {fieldLabel(f.key)}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">{t('options.dateFormat')}</Label>
                <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormat)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('options.dateAuto')}</SelectItem>
                    <SelectItem value="DMY">{t('options.dateDMY')}</SelectItem>
                    <SelectItem value="MDY">{t('options.dateMDY')}</SelectItem>
                    <SelectItem value="YMD">{t('options.dateYMD')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('options.decimal')}</Label>
                <Select
                  value={decimalSeparator}
                  onValueChange={(v) => setDecimalSeparator(v as DecimalSeparator)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('options.decimalAuto')}</SelectItem>
                    <SelectItem value=".">{t('options.decimalDot')}</SelectItem>
                    <SelectItem value=",">{t('options.decimalComma')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('options.countryCode')}</Label>
                <Input
                  className="h-8"
                  placeholder="+47"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('options.duplicates')}</Label>
                <Select value={duplicates} onValueChange={(v) => setDuplicates(v as DuplicateRule)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="update">{t('options.duplicatesUpdate')}</SelectItem>
                    <SelectItem value="skip">{t('options.duplicatesSkip')}</SelectItem>
                    <SelectItem value="create">{t('options.duplicatesCreate')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {missing.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  {t('mapping.missingRequired', {
                    fields: missing.map(fieldLabel).join(', '),
                  })}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground">{t('mapping.dryRunHint')}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleClose(false)}>
                  {t('cancel')}
                </Button>
                <Button onClick={() => runDryRun({}, 'all')} disabled={busy || missing.length > 0}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('mapping.runDryRun')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Preview (dry run) ──────────────────────────────────────────── */}
        {step === 'preview' && dryRun && page && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-4">
              {(['create', 'update', 'skip', 'error'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => loadPage(0, filter === k ? 'all' : k)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    filter === k ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="text-lg font-semibold tabular-nums">{dryRun.summary[k]}</div>
                  <div className="text-xs text-muted-foreground">{t(`summary.${k}`)}</div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {dryRun.summary.customersToCreate > 0 && (
                  <span>
                    {t('summary.customersToCreate', { count: dryRun.summary.customersToCreate })}
                  </span>
                )}
                {dryRun.summary.customersToUpdate > 0 && (
                  <span>
                    {t('summary.customersToUpdate', { count: dryRun.summary.customersToUpdate })}
                  </span>
                )}
                {dryRun.summary.vehiclesToCreate > 0 && (
                  <span>
                    {t('summary.vehiclesToCreate', { count: dryRun.summary.vehiclesToCreate })}
                  </span>
                )}
                {dryRun.summary.vehiclesToUpdate > 0 && (
                  <span>
                    {t('summary.vehiclesToUpdate', { count: dryRun.summary.vehiclesToUpdate })}
                  </span>
                )}
                {dryRun.summary.servicesToCreate > 0 && (
                  <span>
                    {t('summary.servicesToCreate', { count: dryRun.summary.servicesToCreate })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={filter === 'warning' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => loadPage(0, filter === 'warning' ? 'all' : 'warning')}
                >
                  {t('summary.warnings')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={downloadReport}
                  disabled={busy}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  {t('preview.downloadReport')}
                </Button>
              </div>
            </div>

            {dryRun.limit?.exceeded && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>
                  {t('preview.limitExceeded', {
                    remaining: dryRun.limit.remaining,
                    needed: dryRun.summary.customersToCreate,
                  })}
                </span>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="w-24">{t('preview.colAction')}</TableHead>
                    {entity === 'customers' && (
                      <>
                        <TableHead>{t('fields.customer.name')}</TableHead>
                        <TableHead>{t('fields.customer.email')}</TableHead>
                        <TableHead>{t('fields.customer.phone')}</TableHead>
                      </>
                    )}
                    {entity === 'vehicles' && (
                      <>
                        <TableHead>{t('groups.vehicle')}</TableHead>
                        <TableHead>{t('fields.vehicle.licensePlate')}</TableHead>
                        <TableHead>{t('preview.colOwner')}</TableHead>
                      </>
                    )}
                    {entity === 'services' && (
                      <>
                        <TableHead>{t('fields.service.date')}</TableHead>
                        <TableHead>{t('fields.service.title')}</TableHead>
                        <TableHead>{t('groups.vehicle')}</TableHead>
                        <TableHead className="text-right">{t('fields.service.total')}</TableHead>
                      </>
                    )}
                    <TableHead>{t('preview.colDetails')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        {t('preview.empty')}
                      </TableCell>
                    </TableRow>
                  )}
                  {page.rows.map((row) => (
                    <PreviewRow
                      key={row.index}
                      row={row}
                      entity={entity}
                      issueText={issueText}
                      onAction={(a) => setRowAction(row.index, a)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {t('preview.pageInfo', {
                    from: page.total === 0 ? 0 : page.page * page.pageSize + 1,
                    to: Math.min(page.total, (page.page + 1) * page.pageSize),
                    total: page.total,
                  })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={busy || page.page === 0}
                  onClick={() => loadPage(page.page - 1, filter)}
                >
                  {t('preview.prev')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={busy || (page.page + 1) * page.pageSize >= page.total}
                  onClick={() => loadPage(page.page + 1, filter)}
                >
                  {t('preview.next')}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('mapping')}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t('preview.backToMapping')}
                </Button>
                <Button
                  onClick={runCommit}
                  disabled={
                    busy ||
                    dryRun.limit?.exceeded === true ||
                    dryRun.summary.create + dryRun.summary.update === 0
                  }
                >
                  {t('preview.import', { count: dryRun.summary.create + dryRun.summary.update })}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('preview.nothingWrittenYet')}</p>
          </div>
        )}

        {/* ── Importing ──────────────────────────────────────────────────── */}
        {step === 'importing' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">{t('importing.title')}</p>
            <div className="w-full max-w-md">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 5}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {progress
                  ? t('importing.progress', { done: progress.done, total: progress.total })
                  : t('importing.starting')}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{t('importing.keepOpen')}</p>
          </div>
        )}

        {/* ── Result ─────────────────────────────────────────────────────── */}
        {step === 'result' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  undone ? 'bg-muted' : 'bg-emerald-500/10'
                }`}
              >
                {undone ? (
                  <Undo2 className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Check className="h-5 w-5 text-emerald-600" />
                )}
              </div>
              <div>
                <p className="font-medium">
                  {undone ? t('result.undoneTitle') : t('result.title')}
                </p>
                <div className="space-y-0.5 text-sm text-muted-foreground">
                  <p>{t('result.created', { count: result.created })}</p>
                  {result.updated > 0 && <p>{t('result.updated', { count: result.updated })}</p>}
                  {result.skipped > 0 && <p>{t('result.skipped', { count: result.skipped })}</p>}
                  {result.failed > 0 && <p>{t('result.failed', { count: result.failed })}</p>}
                </div>
              </div>
            </div>

            {result.failures.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  {t('result.writeFailures', { count: result.failures.length })}
                </div>
                <div className="max-h-32 overflow-auto rounded border p-2 text-xs text-muted-foreground">
                  {result.failures.slice(0, 50).map((f) => (
                    <p key={f.index}>
                      {t('result.rowFailure', { row: f.index + 2, error: issueText(f.issue) })}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              {!undone && result.created > 0 ? (
                <Button variant="outline" onClick={undo} disabled={busy}>
                  {busy ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Undo2 className="mr-1 h-4 w-4" />
                  )}
                  {t('result.undo')}
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={() => handleClose(false)}>{t('done')}</Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('result.undoHint')}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ActionBadge({ action, t }: { action: RowAction; t: ReturnType<typeof useTranslations> }) {
  const styles: Record<RowAction, string> = {
    create: 'text-emerald-600 border-emerald-500/30',
    update: 'text-blue-600 border-blue-500/30',
    skip: 'text-muted-foreground',
    error: 'text-destructive border-destructive/30',
  }
  return (
    <Badge variant="outline" className={`text-xs ${styles[action]}`}>
      {t(`actions.${action}`)}
    </Badge>
  )
}

function PreviewRow({
  row,
  entity,
  issueText,
  onAction,
}: {
  row: RowPlan
  entity: ImportEntity
  issueText: (issue: RowIssue) => string
  onAction: (action: RowAction) => void
}) {
  const t = useTranslations('dataImport')
  const matched =
    entity === 'customers'
      ? row.customerMatch
      : entity === 'vehicles'
        ? row.vehicleMatch
        : undefined
  const canToggle = row.action !== 'error'
  const vehicle = row.vehicle
    ? [row.vehicle.year, row.vehicle.make, row.vehicle.model].filter(Boolean).join(' ')
    : ''

  const details: string[] = []
  if (row.customerMatch && entity !== 'customers')
    details.push(t('preview.linksCustomer', { name: row.customerMatch.name }))
  if (row.customerMatch && entity === 'customers')
    details.push(
      t('preview.matchedOn', {
        name: row.customerMatch.name,
        on: t(`matchOn.${row.customerMatch.on}`),
      })
    )
  if (row.vehicleMatch && entity !== 'vehicles')
    details.push(t('preview.linksVehicle', { label: row.vehicleMatch.label }))
  if (row.vehicleMatch && entity === 'vehicles')
    details.push(
      t('preview.matchedOn', {
        name: row.vehicleMatch.label,
        on: t(`matchOn.${row.vehicleMatch.on}`),
      })
    )
  if (row.customerSameAs != null)
    details.push(t('preview.sameCustomerAsRow', { row: row.customerSameAs + 2 }))
  if (row.vehicleSameAs != null)
    details.push(t('preview.sameVehicleAsRow', { row: row.vehicleSameAs + 2 }))
  if (row.createsCustomer && entity !== 'customers') details.push(t('preview.createsCustomer'))
  if (row.createsVehicle && entity !== 'vehicles') details.push(t('preview.createsVehicle'))

  return (
    <TableRow className={row.action === 'skip' ? 'opacity-60' : ''}>
      <TableCell className="text-xs text-muted-foreground tabular-nums">{row.index + 2}</TableCell>
      <TableCell>
        {canToggle ? (
          <Select value={row.action} onValueChange={(v) => onAction(v as RowAction)}>
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {matched && <SelectItem value="update">{t('actions.update')}</SelectItem>}
              <SelectItem value="skip">{t('actions.skip')}</SelectItem>
              <SelectItem value="create">{t('actions.create')}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <ActionBadge action={row.action} t={t} />
        )}
      </TableCell>
      {entity === 'customers' && (
        <>
          <TableCell className="whitespace-nowrap font-medium">
            {row.customer?.name ?? '-'}
          </TableCell>
          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
            {row.customer?.email ?? '-'}
          </TableCell>
          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
            {row.customer?.phone ?? '-'}
          </TableCell>
        </>
      )}
      {entity === 'vehicles' && (
        <>
          <TableCell className="whitespace-nowrap font-medium">{vehicle || '-'}</TableCell>
          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
            {row.vehicle?.licensePlate ?? row.vehicle?.vin ?? '-'}
          </TableCell>
          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
            {row.customer?.name ?? '-'}
          </TableCell>
        </>
      )}
      {entity === 'services' && (
        <>
          <TableCell className="whitespace-nowrap text-sm">
            {row.service?.date?.slice(0, 10) ?? '-'}
          </TableCell>
          <TableCell className="max-w-[240px] truncate font-medium">
            {row.service?.title ?? '-'}
          </TableCell>
          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
            {row.vehicleMatch?.label ??
              [vehicle, row.vehicle?.licensePlate].filter(Boolean).join(' ') ??
              '-'}
          </TableCell>
          <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
            {row.service?.total ?? '-'}
          </TableCell>
        </>
      )}
      <TableCell className="text-xs">
        {details.map((d, i) => (
          <div key={i} className="text-muted-foreground">
            {d}
          </div>
        ))}
        {row.errors.map((e, i) => (
          <div key={`e${i}`} className="text-destructive">
            {issueText(e)}
          </div>
        ))}
        {row.warnings.map((w, i) => (
          <div key={`w${i}`} className="text-amber-600">
            {issueText(w)}
          </div>
        ))}
      </TableCell>
    </TableRow>
  )
}
