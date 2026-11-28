'use client'

import { FileSpreadsheet, FileText, Loader2, Printer, Sheet } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { exportBillingReport } from '@/features/billing/Actions/exportBillingReport'
import { getBillingReport } from '@/features/billing/Actions/getBillingReport'
import {
  BillingReportSheet,
  printBillingReport,
} from '@/features/billing/Components/BillingReportSheet'
import type { BillingReportData } from '@/features/billing/Lib/billingReport.server'
import {
  buildReportModel,
  type ReportModel,
  reportFormatters,
  type Translate,
} from '@/features/billing/Lib/billingReportModel'
import type {
  BillingColumn,
  BillingListInput,
  BillingReportFormat,
} from '@/features/billing/Schema/billingListSchema'
import { cn } from '@/lib/utils'

const FORMATS: { value: BillingReportFormat; icon: typeof Printer }[] = [
  { value: 'print', icon: Printer },
  { value: 'pdf', icon: FileText },
  { value: 'xlsx', icon: FileSpreadsheet },
  { value: 'csv', icon: Sheet },
]

/** The most rows a report carries, as the server cuts it. */
const ROW_LIMIT = 5000

function download(base64: string, mimeType: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Turns what the billing list shows (its filters, date range, grouping and
 * columns) into a report: printed, or downloaded as PDF, Excel or CSV. Every
 * matching invoice goes in, not just the rows scrolled into view.
 */
export function GenerateReportDialog({
  open,
  onOpenChange,
  filters,
  columns,
  count,
  description,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: BillingListInput
  columns: BillingColumn[]
  /** How many invoices the list has under these filters. */
  count?: number
  /** What the list is showing, in words, e.g. "Unpaid · 01/09/2026 – 30/11/2026". */
  description: string
}) {
  const t = useTranslations('billing.report')
  const translate: Translate = (key, values) => t(key as never, values as never)
  const locale = useLocale()
  const [format, setFormat] = useState<BillingReportFormat>('print')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const [printing, setPrinting] = useState<ReportModel | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  // A spinner only once the wait is long enough to notice.
  useEffect(() => {
    if (!busy) {
      setSlow(false)
      return
    }
    const timer = window.setTimeout(() => setSlow(true), 300)
    return () => window.clearTimeout(timer)
  }, [busy])

  // The print copy exists only while it is handed to the browser.
  useEffect(() => {
    if (!printing || !printRef.current) return
    printBillingReport(
      printRef.current,
      printing,
      t('pageOf', { page: '{page}', pages: '{pages}' })
    )
    setPrinting(null)
  }, [printing, t])

  const modelFor = (report: BillingReportData) =>
    buildReportModel(report, translate, reportFormatters(report, locale))

  const generate = async () => {
    setBusy(true)
    try {
      const input = { ...filters, columns, title: title.trim() || undefined }
      if (format === 'print') {
        const result = await getBillingReport(input)
        if (!result.success || !result.data) throw new Error(result.error)
        setPrinting(modelFor(result.data))
      } else {
        const result = await exportBillingReport({ ...input, format })
        if (!result.success || !result.data) throw new Error(result.error)
        download(result.data.base64, result.data.mimeType, result.data.fileName)
      }
      onOpenChange(false)
    } catch {
      toast.error(t('failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
            <DialogDescription>{t('dialogDescription')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium">
                {count === undefined ? description : t('includes', { count, description })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('columnCount', { count: columns.length })}
              </p>
              {count !== undefined && count > ROW_LIMIT && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('overLimit', { limit: ROW_LIMIT })}
                </p>
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{t('format')}</legend>
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {FORMATS.map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={format === value}
                    onClick={() => setFormat(value)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      format === value && 'border-primary bg-primary/5 ring-1 ring-primary'
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{t(`formats.${value}`)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t(`formatHints.${value}`)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="billing-report-title">{t('titleLabel')}</Label>
              <Input
                id="billing-report-title"
                value={title}
                maxLength={120}
                placeholder={t('defaultTitle')}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button onClick={generate} disabled={busy || count === 0}>
              {slow && <Loader2 className="h-4 w-4 animate-spin" />}
              {format === 'print' ? t('generatePrint') : t('generateDownload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {printing && (
        <div hidden>
          {/* The copy handed to the print frame; the hidden wrapper stays behind. */}
          <div ref={printRef}>
            <BillingReportSheet model={printing} />
          </div>
        </div>
      )}
    </>
  )
}
