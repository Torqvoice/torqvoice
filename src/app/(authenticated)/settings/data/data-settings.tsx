'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useGlassModal } from '@/components/glass-modal'
import { AlertTriangle, ArrowRight, Download, FileArchive, Loader2, Trash2, Upload } from 'lucide-react'
import { ReadOnlyBanner, ReadOnlyWrapper } from '../read-only-guard'
import { deleteContent } from '@/features/settings/Actions/deleteContent'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface ContentCounts {
  vehicles: number
  customers: number
  quotes: number
  inventory: number
}

interface ExportOptions {
  settings: boolean
  customers: boolean
  vehicles: boolean
  quotes: boolean
  inventory: boolean
  customFields: boolean
  files: boolean
}

const OPTION_META: { key: keyof ExportOptions; labelKey: string; descKey: string }[] = [
  { key: 'settings', labelKey: 'optSettings', descKey: 'optSettingsDesc' },
  { key: 'customers', labelKey: 'optCustomers', descKey: 'optCustomersDesc' },
  { key: 'vehicles', labelKey: 'optVehicles', descKey: 'optVehiclesDesc' },
  { key: 'quotes', labelKey: 'optQuotes', descKey: 'optQuotesDesc' },
  { key: 'inventory', labelKey: 'optInventory', descKey: 'optInventoryDesc' },
  { key: 'customFields', labelKey: 'optCustomFields', descKey: 'optCustomFieldsDesc' },
  { key: 'files', labelKey: 'optFiles', descKey: 'optFilesDesc' },
]

const ALL_TRUE: ExportOptions = {
  settings: true,
  customers: true,
  vehicles: true,
  quotes: true,
  inventory: true,
  customFields: true,
  files: true,
}

export function DataSettings({ contentCounts }: { contentCounts: ContentCounts }) {
  const t = useTranslations('settings')
  const router = useRouter()
  const modal = useGlassModal()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [options, setOptions] = useState<ExportOptions>({ ...ALL_TRUE })

  const allChecked = Object.values(options).every(Boolean)
  const noneChecked = Object.values(options).every((v) => !v)

  const toggleAll = () => {
    if (allChecked) {
      setOptions({
        settings: false,
        customers: false,
        vehicles: false,
        quotes: false,
        inventory: false,
        customFields: false,
        files: false,
      })
    } else {
      setOptions({ ...ALL_TRUE })
    }
  }

  const toggleOption = (key: keyof ExportOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/protected/backup/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include: options }),
      })
      if (!res.ok) {
        throw new Error('Export failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
        `torqvoice-backup-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      modal.open('success', t('data.exportComplete'), t('data.exportCompleteMessage'))
    } catch {
      modal.open('error', t('data.exportFailed'), t('data.exportFailedMessage'))
    }
    setExporting(false)
  }

  const handleImport = async () => {
    if (!selectedFile) return

    setImporting(true)
    try {
      const isZip = selectedFile.name.endsWith('.zip')

      let res: Response

      if (isZip) {
        const buffer = await selectedFile.arrayBuffer()
        res = await fetch('/api/protected/backup/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/zip' },
          body: buffer,
        })
      } else {
        const text = await selectedFile.text()
        const json = JSON.parse(text)
        res = await fetch('/api/protected/backup/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json),
        })
      }

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Import failed')
      }

      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      modal.open('success', t('data.importComplete'), t('data.importCompleteMessage'))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('data.importFailed')
      modal.open('error', t('data.importFailed'), message)
    }
    setImporting(false)
  }

  // ── LubeLog import dialog ──────────────────────────────────────────────
  const lubelogInputRef = useRef<HTMLInputElement>(null)
  const [lubelogOpen, setLubelogOpen] = useState(false)
  const [lubelogFile, setLubelogFile] = useState<File | null>(null)
  const [importingLubelog, setImportingLubelog] = useState(false)

  const handleLubeLogImport = async () => {
    if (!lubelogFile) return

    setImportingLubelog(true)
    try {
      const buffer = await lubelogFile.arrayBuffer()
      const res = await fetch('/api/protected/backup/import-lubelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: buffer,
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Import failed')
      }

      const result = await res.json()
      setLubelogFile(null)
      if (lubelogInputRef.current) lubelogInputRef.current.value = ''
      setLubelogOpen(false)
      modal.open(
        'success',
        t('data.lubelogImportComplete'),
        `Imported ${result.imported.vehicles} vehicles, ${result.imported.serviceRecords} service records, and ${result.imported.notes} notes.`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : t('data.importFailed')
      modal.open('error', t('data.importFailed'), message)
    }
    setImportingLubelog(false)
  }

  // ── Invoice Ninja import dialog ──────────────────────────────────────────
  const invoiceNinjaInputRef = useRef<HTMLInputElement>(null)
  const [invoiceNinjaOpen, setInvoiceNinjaOpen] = useState(false)
  const [invoiceNinjaFile, setInvoiceNinjaFile] = useState<File | null>(null)
  const [importingInvoiceNinja, setImportingInvoiceNinja] = useState(false)

  // Delete content state
  const [contentDialogOpen, setContentDialogOpen] = useState(false)
  const [contentConfirmText, setContentConfirmText] = useState('')
  const [deletingContent, setDeletingContent] = useState(false)
  const [contentSelections, setContentSelections] = useState({
    vehicles: false,
    customers: false,
    quotes: false,
    inventory: false,
  })

  const selectedContentCount = Object.values(contentSelections).filter(Boolean).length

  const handleDeleteContent = async () => {
    if (contentConfirmText !== 'delete my data') return
    if (selectedContentCount === 0) return
    setDeletingContent(true)
    try {
      const result = await deleteContent(contentSelections)
      if (result.success) {
        toast.success(t('account.contentDeleted'))
        setContentDialogOpen(false)
        setContentConfirmText('')
        setContentSelections({ vehicles: false, customers: false, quotes: false, inventory: false })
        router.refresh()
      } else {
        toast.error(result.error || t('account.failedDeleteContent'))
      }
    } catch {
      toast.error(t('account.failedDeleteContent'))
    }
    setDeletingContent(false)
  }

  const handleInvoiceNinjaImport = async () => {
    if (!invoiceNinjaFile) return

    setImportingInvoiceNinja(true)
    try {
      const buffer = await invoiceNinjaFile.arrayBuffer()
      const res = await fetch('/api/protected/backup/import-invoice-ninja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: buffer,
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Import failed')
      }

      const result = await res.json()
      setInvoiceNinjaFile(null)
      if (invoiceNinjaInputRef.current) invoiceNinjaInputRef.current.value = ''
      setInvoiceNinjaOpen(false)
      modal.open(
        'success',
        t('data.invoiceNinjaImportComplete'),
        `Imported ${result.imported.customers} customers, ${result.imported.products} products, ${result.imported.invoices} invoices, ${result.imported.documents} documents, and ${result.imported.payments} payments.`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : t('data.importFailed')
      modal.open('error', t('data.importFailed'), message)
    }
    setImportingInvoiceNinja(false)
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <h2 className="text-lg font-semibold">{t('data.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('data.description')}
        </p>
      </div>

      <ReadOnlyWrapper>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Export Card */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Download className="h-4 w-4" /> {t('data.exportTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('data.exportDescription')}
              </p>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('data.includeInBackup')}</span>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-primary hover:underline"
                  >
                    {allChecked ? t('data.deselectAll') : t('data.selectAll')}
                  </button>
                </div>

                <div className="space-y-2">
                  {OPTION_META.map(({ key, labelKey, descKey }) => (
                    <label
                      key={key}
                      className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={options[key]}
                        onCheckedChange={() => toggleOption(key)}
                        className="mt-0.5"
                      />
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium leading-none">{t(`data.${labelKey}`)}</div>
                        <div className="text-xs text-muted-foreground">{t(`data.${descKey}`)}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {options.files && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <FileArchive className="h-3.5 w-3.5 shrink-0" />
                    {t('data.filesWarning')}
                  </p>
                )}
              </div>

              <Button onClick={handleExport} disabled={exporting || noneChecked}>
                {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('data.downloadBackup')}
              </Button>
            </CardContent>
          </Card>

          {/* Import Card */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" /> {t('data.importTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t.rich('data.importWarning', { bold: (chunks) => <strong>{chunks}</strong> })}
                </span>
              </div>
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.zip"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                />
                <p className="text-xs text-muted-foreground">
                  {t('data.importFileHint')}
                </p>
                <Button
                  onClick={handleImport}
                  disabled={!selectedFile || importing}
                  variant="outline"
                >
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('data.uploadRestore')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Import from Other Services */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRight className="h-4 w-4" /> {t('data.importFromOther')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('data.importFromOtherDescription')}
            </p>
            <div className="flex flex-wrap gap-4">
              {/* LubeLog */}
              <button
                type="button"
                onClick={() => setLubelogOpen(true)}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/50 hover:shadow-md"
              >
                <Image
                  src="/images/import/lubelog.png"
                  alt="LubeLog"
                  width={120}
                  height={30}
                  className="object-contain"
                  unoptimized
                />
              </button>

              {/* Invoice Ninja */}
              <button
                type="button"
                onClick={() => setInvoiceNinjaOpen(true)}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/50 hover:shadow-md"
              >
                <Image
                  src="/images/import/invoice_ninja.png"
                  alt="Invoice Ninja"
                  width={140}
                  height={30}
                  className="object-contain"
                  unoptimized
                />
              </button>
            </div>
          </CardContent>
        </Card>
      </ReadOnlyWrapper>

      {/* LubeLog Import Dialog */}
      <Dialog
        open={lubelogOpen}
        onOpenChange={(open) => {
          setLubelogOpen(open)
          if (!open) {
            setLubelogFile(null)
            if (lubelogInputRef.current) lubelogInputRef.current.value = ''
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Image
                src="/images/import/lubelog.png"
                alt="LubeLog"
                width={24}
                height={24}
                className="object-contain"
                unoptimized
              />
              {t('data.lubelogTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('data.lubelogExportSteps')}</p>
              <ol className="list-inside list-decimal space-y-1.5 text-sm text-muted-foreground">
                <li>{t('data.lubelogStep1')}</li>
                <li>
                  {t.rich('data.lubelogStep2', { bold: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
                </li>
                <li>
                  {t.rich('data.lubelogStep3', { bold: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
                </li>
                <li>{t('data.lubelogStep4')}</li>
              </ol>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400">
              <FileArchive className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t.rich('data.lubelogAddNote', { bold: (chunks) => <strong>{chunks}</strong> })}
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('data.lubelogImported')}</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>{t('data.lubelogVehicles')}</li>
                <li>{t('data.lubelogServiceRecords')}</li>
                <li>{t('data.lubelogNotes')}</li>
              </ul>
            </div>

            <div className="space-y-3 border-t pt-4">
              <input
                ref={lubelogInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => setLubelogFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
              />
              <p className="text-xs text-muted-foreground">{t('data.lubelogFileHint')}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setLubelogOpen(false)}>
                {t('data.cancel')}
              </Button>
              <Button onClick={handleLubeLogImport} disabled={!lubelogFile || importingLubelog}>
                {importingLubelog && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('data.import')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Danger Zone */}
      <Card className="border-destructive/30 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-lg text-destructive">{t('account.dangerZone')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{t('account.deleteContentTitle')}</p>
              <p className="text-sm text-muted-foreground">
                {t('account.deleteContentDescription')}
              </p>
            </div>
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setContentConfirmText('')
                setContentSelections({ vehicles: false, customers: false, quotes: false, inventory: false })
                setContentDialogOpen(true)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('account.deleteContentButton')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Content Confirmation Dialog */}
      <Dialog open={contentDialogOpen} onOpenChange={setContentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('account.deleteContentDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('account.deleteContentDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-3">
              {([
                {
                  key: 'vehicles' as const,
                  label: t('account.contentVehicles'),
                  count: contentCounts.vehicles,
                  description: t('account.contentVehiclesDescription'),
                },
                {
                  key: 'customers' as const,
                  label: t('account.contentCustomers'),
                  count: contentCounts.customers,
                  description: t('account.contentCustomersDescription'),
                },
                {
                  key: 'quotes' as const,
                  label: t('account.contentQuotes'),
                  count: contentCounts.quotes,
                  description: t('account.contentQuotesDescription'),
                },
                {
                  key: 'inventory' as const,
                  label: t('account.contentInventory'),
                  count: contentCounts.inventory,
                  description: t('account.contentInventoryDescription'),
                },
              ]).map((item) => (
                <label
                  key={item.key}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    contentSelections[item.key]
                      ? 'border-destructive/50 bg-destructive/5'
                      : 'hover:bg-muted/50'
                  } ${item.count === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Checkbox
                    checked={contentSelections[item.key]}
                    disabled={item.count === 0}
                    onCheckedChange={(checked) =>
                      setContentSelections((prev) => ({ ...prev, [item.key]: checked === true }))
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {item.count}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {selectedContentCount > 0 && (
              <>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-destructive">
                    {t.rich('account.deleteContentConfirmPrompt', { bold: (chunks) => <span className="font-mono font-bold">{chunks}</span> })}
                  </p>
                </div>
                <Input
                  value={contentConfirmText}
                  onChange={(e) => setContentConfirmText(e.target.value)}
                  placeholder={t('account.deleteContentConfirmPhrase')}
                  autoComplete="off"
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContentDialogOpen(false)} disabled={deletingContent}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteContent}
              disabled={
                selectedContentCount === 0 ||
                contentConfirmText !== 'delete my data' ||
                deletingContent
              }
            >
              {deletingContent ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {deletingContent ? t('account.deleting') : t('account.deleteSelected', { count: selectedContentCount })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Ninja Import Dialog */}
      <Dialog
        open={invoiceNinjaOpen}
        onOpenChange={(open) => {
          setInvoiceNinjaOpen(open)
          if (!open) {
            setInvoiceNinjaFile(null)
            if (invoiceNinjaInputRef.current) invoiceNinjaInputRef.current.value = ''
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Image
                src="/images/import/invoice_ninja.png"
                alt="Invoice Ninja"
                width={28}
                height={28}
                className="object-contain"
                unoptimized
              />
              {t('data.invoiceNinjaTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('data.invoiceNinjaExportSteps')}</p>
              <ol className="list-inside list-decimal space-y-1.5 text-sm text-muted-foreground">
                <li>{t('data.invoiceNinjaStep1')}</li>
                <li>
                  {t.rich('data.invoiceNinjaStep2', { bold: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
                </li>
                <li>
                  {t.rich('data.invoiceNinjaStep3', { bold: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
                </li>
                <li>{t('data.invoiceNinjaStep4')}</li>
              </ol>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400">
              <FileArchive className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t.rich('data.invoiceNinjaAddNote', { bold: (chunks) => <strong>{chunks}</strong> })}
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('data.invoiceNinjaImported')}</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>{t('data.invoiceNinjaCustomers')}</li>
                <li>{t('data.invoiceNinjaProducts')}</li>
                <li>{t('data.invoiceNinjaInvoices')}</li>
                <li>{t('data.invoiceNinjaDocuments')}</li>
                <li>{t('data.invoiceNinjaPayments')}</li>
              </ul>
            </div>

            <div className="space-y-3 border-t pt-4">
              <input
                ref={invoiceNinjaInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => setInvoiceNinjaFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
              />
              <p className="text-xs text-muted-foreground">
                {t('data.invoiceNinjaFileHint')}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setInvoiceNinjaOpen(false)}>
                {t('data.cancel')}
              </Button>
              <Button
                onClick={handleInvoiceNinjaImport}
                disabled={!invoiceNinjaFile || importingInvoiceNinja}
              >
                {importingInvoiceNinja && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('data.import')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
