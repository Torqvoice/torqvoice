'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Braces, FileSpreadsheet, Loader2, Send, Table2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useServiceType } from '@/components/service-type-context'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormatDate } from '@/lib/use-format-date'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { type Locale, localeNames, locales } from '@/i18n/config'
import type {
  CodeImportChecked,
  CodeImportCounts,
  CodeImportStatus,
} from '@/features/integrations/Lib/types'
import { getCodeImports } from '../Actions/getCodeImports'
import { MakeCombobox, type PickedMake } from './MakeCombobox'
import { MAKES, makeKey, makeName } from '../Lib/makes'

const CHECK_URL = '/api/protected/fault-codes/import/check'
const SEND_URL = '/api/protected/fault-codes/import'
const EXAMPLE_URL = '/api/protected/fault-codes/import/example'
const FILE_PROBLEMS = [
  'unreadable',
  'empty',
  'no_code_column',
  'too_many',
  'format',
  'legacy_xls',
] as const
const FAILURES = ['paused', 'nothing', 'demo', 'rights', 'too_large'] as const

type Row = CodeImportChecked & { title: string | null }
type Checked = { counts: CodeImportCounts; rows: Row[] }
type Reply<T> = { success: true; data: T } | { success: false; error?: string; problem?: string }

/** A JSON file's own make, language and source, to fill the fields the person left empty. */
async function jsonMeta(
  file: File
): Promise<{ make?: string; language?: string; source?: string }> {
  if (!file.name.toLowerCase().endsWith('.json')) return {}
  try {
    const parsed = JSON.parse(await file.text())
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {}
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
    return {
      make: s(parsed.make),
      language: s(parsed.language ?? parsed.lang),
      source: s(parsed.source),
    }
  } catch {
    return {}
  }
}

/**
 * Importing fault codes from a file: a make's own codes Torqvoice does not have yet, or more
 * text for codes it has. The examples show the shape; the file is read and every code checked
 * the moment it is dropped, so the person sees what is new, what adds to ours and what to fix
 * before anything is sent. What is sent waits for a person at Torqvoice to publish it.
 */
export function ImportCodesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('faultCodes.import')
  const locale = useLocale()
  const isMarine = useServiceType() === 'marine'
  const { formatDate } = useFormatDate()
  const [make, setMake] = useState<PickedMake | null>(null)
  const [lang, setLang] = useState<string>(
    (locales as readonly string[]).includes(locale) ? locale : 'en'
  )
  const [source, setSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState<Checked | null>(null)
  const [fileProblem, setFileProblem] = useState<string | null>(null)
  const [rights, setRights] = useState(false)
  const [sending, setSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [imports, setImports] = useState<CodeImportStatus[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })

  const makeKeyChosen = make?.key ?? null

  // Earlier imports and how far their review has come, each time the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    getCodeImports()
      .then((r) => {
        if (!cancelled && r.success && r.data) setImports(r.data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open])

  // The file is checked as soon as there is one and a make to check it for.
  useEffect(() => {
    if (!file || !makeKeyChosen) {
      setChecked(null)
      return
    }
    let cancelled = false
    setChecking(true)
    setFileProblem(null)
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('make', makeKeyChosen)
    form.append('lang', lang)
    fetch(CHECK_URL, { method: 'POST', body: form })
      .then((res) => res.json().catch(() => null) as Promise<Reply<Checked> | null>)
      .then((reply) => {
        if (cancelled) return
        if (reply?.success) {
          setChecked(reply.data)
          const c = reply.data.counts
          track('fault_code:import_check', {
            make: makeKeyChosen,
            file_type: file.name.split('.').pop()?.toLowerCase() ?? '',
            rows: reply.data.rows.length,
            new: c.new,
            change: c.change,
            same: c.same,
            problem: c.problem,
          })
          return
        }
        setChecked(null)
        setFileProblem(FILE_PROBLEMS.find((p) => p === reply?.problem) ?? 'failed')
      })
      .catch(() => {
        if (!cancelled) setFileProblem('failed')
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [file, makeKeyChosen, lang])

  const pick = async (picked: File | undefined) => {
    if (!picked) return
    setFile(picked)
    setRights(false)
    if (fileInput.current) fileInput.current.value = ''
    const meta = await jsonMeta(picked)
    if (meta.make && !make) {
      const key = makeKey(meta.make)
      if (key) setMake({ key, name: MAKES.find((m) => m.key === key)?.name ?? meta.make })
    }
    if (meta.language && (locales as readonly string[]).includes(meta.language))
      setLang(meta.language)
    if (meta.source && !source) setSource(meta.source)
  }

  const clearFile = () => {
    setFile(null)
    setChecked(null)
    setFileProblem(null)
    setRights(false)
  }

  const toSend = checked ? checked.counts.new + checked.counts.change : 0

  const send = async () => {
    if (!file || !makeKeyChosen || !rights || toSend === 0 || sending) return
    setSending(true)
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('make', makeKeyChosen)
    form.append('lang', lang)
    if (source.trim()) form.append('source', source.trim())
    form.append('rights', 'yes')
    let reply: Reply<{ id: string; counts: CodeImportCounts; imports: CodeImportStatus[] }> | null =
      null
    try {
      const res = await fetch(SEND_URL, { method: 'POST', body: form })
      reply = await res.json().catch(() => null)
    } catch {
      reply = null
    }
    setSending(false)
    if (reply?.success) {
      track('fault_code:import_send', {
        make: makeKeyChosen,
        codes: reply.data.counts.new + reply.data.counts.change,
        new: reply.data.counts.new,
        change: reply.data.counts.change,
        source: Boolean(source.trim()),
      })
      setImports(reply.data.imports)
      clearFile()
      onOpenChange(false)
      toast.success(t('sent', { count: reply.data.counts.new + reply.data.counts.change }))
      return
    }
    const failure = FAILURES.find((f) => f === reply?.error)
    toast.error(failure ? t(`errors.${failure}`) : t('errors.failed'))
  }

  const rowState = (r: Row) => {
    if (r.state === 'problem')
      return t(`problems.${r.problem ?? 'code'}`, { make: make?.name ?? '' })
    if (r.state === 'new') return t('state.new')
    const what = r.fields.filter((f) => f !== 'causes').map((f) => t(`fields.${f}`))
    if (r.addedCauses > 0) what.push(t('addsCauses', { count: r.addedCauses }))
    else if (r.fields.includes('causes')) what.push(t('fields.causes'))
    return t('state.change', { what: list.format(what) })
  }
  // Problems first, so they are fixed before anything else is read.
  const shown = checked
    ? [
        ...checked.rows.filter((r) => r.state === 'problem'),
        ...checked.rows.filter((r) => r.state === 'new' || r.state === 'change'),
      ]
    : []

  const missing = !makeKeyChosen
    ? t('missing.make')
    : !file
      ? t('missing.file')
      : checking || !checked
        ? null
        : toSend === 0
          ? t('missing.nothing')
          : !rights
            ? t('missing.rights')
            : null

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {imports.length > 0 && (
            <section className="space-y-1.5" aria-label={t('yours')}>
              <h3 className="text-sm font-medium">{t('yours')}</h3>
              <ul className="divide-y divide-card-edge/60 rounded-lg border border-card-edge text-sm">
                {imports.slice(0, 3).map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2"
                  >
                    <span className="font-medium">
                      {makeName(i.make)}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {t('codes', { count: i.counts.new + i.counts.change })}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        i.counts.published > 0
                          ? t('status.published', { count: i.counts.published })
                          : null,
                        i.counts.pending > 0
                          ? t('status.pending', { count: i.counts.pending })
                          : null,
                        i.counts.rejected > 0
                          ? t('status.rejected', { count: i.counts.rejected })
                          : null,
                        formatDate(i.createdAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t('examples.title')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <a
                href={`${EXAMPLE_URL}?format=xlsx`}
                download
                onClick={() => track('fault_code:import_example_download', { format: 'xlsx' })}
                className="flex items-center gap-3 rounded-lg border border-card-edge px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <Table2 className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t('examples.sheet')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t('examples.sheetHint')}
                  </span>
                </span>
              </a>
              <a
                href={`${EXAMPLE_URL}?format=json`}
                download
                onClick={() => track('fault_code:import_example_download', { format: 'json' })}
                className="flex items-center gap-3 rounded-lg border border-card-edge px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <Braces className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t('examples.json')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t('examples.jsonHint')}
                  </span>
                </span>
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('examples.columns')}{' '}
              <a
                href={`${EXAMPLE_URL}?format=csv`}
                download
                onClick={() => track('fault_code:import_example_download', { format: 'csv' })}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {t('examples.csv')}
              </a>
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="import-make" className="text-xs text-muted-foreground">
                {t('make')}
              </Label>
              <MakeCombobox id="import-make" value={make} onChange={setMake} marine={isMarine} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-lang" className="text-xs text-muted-foreground">
                {t('language')}
              </Label>
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger id="import-lang" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locales.map((l) => (
                    <SelectItem key={l} value={l}>
                      {localeNames[l as Locale]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-source" className="text-xs text-muted-foreground">
                {t('source')}
              </Label>
              <Input
                id="import-source"
                value={source}
                maxLength={500}
                placeholder={t('sourcePlaceholder')}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
          </section>

          <section className="space-y-3">
            {file ? (
              <div className="flex items-center gap-3 rounded-lg border border-card-edge px-3 py-2.5">
                <FileSpreadsheet className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {checking
                      ? t('checking')
                      : checked
                        ? t('codes', { count: checked.rows.length })
                        : !makeKeyChosen
                          ? t('missing.make')
                          : ''}
                  </span>
                </span>
                {checking && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={t('removeFile')}
                  onClick={clearFile}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('Files')) return
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  void pick(e.dataTransfer.files[0])
                }}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
                  dragging && 'border-primary/60 bg-primary/5'
                )}
              >
                <Upload className="size-5" aria-hidden />
                <span className="text-sm font-medium text-foreground">{t('drop')}</span>
                <span>{t('dropTypes')}</span>
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xlsm,.csv,.txt,.json"
              hidden
              data-testid="import-file-input"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            {fileProblem && (
              <p className="text-sm font-medium text-destructive">
                {fileProblem === 'failed'
                  ? t('errors.failed')
                  : t(`fileProblems.${fileProblem as (typeof FILE_PROBLEMS)[number]}`)}
              </p>
            )}

            {checked && (
              <>
                <div className="flex flex-wrap gap-2">
                  {checked.counts.new > 0 && (
                    <span className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {t('counts.new', { count: checked.counts.new })}
                    </span>
                  )}
                  {checked.counts.change > 0 && (
                    <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {t('counts.change', { count: checked.counts.change })}
                    </span>
                  )}
                  {checked.counts.problem > 0 && (
                    <span className="rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                      {t('counts.problem', { count: checked.counts.problem })}
                    </span>
                  )}
                  {checked.counts.same > 0 && (
                    <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      {t('counts.same', { count: checked.counts.same })}
                    </span>
                  )}
                </div>
                {shown.length > 0 && (
                  <ul
                    className="divide-y divide-card-edge/60 rounded-lg border border-card-edge text-sm"
                    aria-label={t('rows')}
                  >
                    {shown.slice(0, 200).map((r) => (
                      <li
                        key={r.n}
                        className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-3 py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,14rem)]"
                      >
                        <span className="font-mono text-xs leading-5">{r.code}</span>
                        <span className="truncate">
                          {r.title ?? (
                            <span className="text-muted-foreground">{t('row', { n: r.n })}</span>
                          )}
                        </span>
                        <span
                          className={cn(
                            'col-start-2 text-xs sm:col-start-auto sm:text-right',
                            r.state === 'problem'
                              ? 'text-destructive'
                              : r.state === 'new'
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-primary'
                          )}
                        >
                          {r.state === 'problem'
                            ? `${t('row', { n: r.n })}: ${rowState(r)}`
                            : rowState(r)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {shown.length > 200 && (
                  <p className="text-xs text-muted-foreground">
                    {t('more', { count: shown.length - 200 })}
                  </p>
                )}
                {checked.counts.problem > 0 && toSend > 0 && (
                  <p className="text-xs text-muted-foreground">{t('problemsLeftOut')}</p>
                )}
                {toSend > 0 && (
                  <label className="flex items-start gap-2.5 text-sm">
                    <Checkbox
                      checked={rights}
                      onCheckedChange={(v) => setRights(v === true)}
                      className="mt-0.5"
                    />
                    <span>{t('rights')}</span>
                  </label>
                )}
              </>
            )}
          </section>
        </DialogBody>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {missing ?? t('reviewHint')}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={sending}
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              disabled={Boolean(missing) || checking || sending || toSend === 0}
              onClick={() => void send()}
            >
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              {toSend > 0 ? t('send', { count: toSend }) : t('sendNone')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
