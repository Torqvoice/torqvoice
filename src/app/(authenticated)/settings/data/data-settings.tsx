'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGlassModal } from '@/components/glass-modal'
import { AlertTriangle, ArrowRight, Download, FileArchive, Loader2, Upload } from 'lucide-react'
import { ReadOnlyBanner, ReadOnlyWrapper } from '../read-only-guard'

interface ExportOptions {
  settings: boolean
  customers: boolean
  vehicles: boolean
  quotes: boolean
  inventory: boolean
  customFields: boolean
  files: boolean
}

const OPTION_LABELS: { key: keyof ExportOptions; label: string; description: string }[] = [
  {
    key: 'settings',
    label: 'Settings',
    description: 'Workshop info, invoice config, payment providers',
  },
  { key: 'customers', label: 'Customers', description: 'Customer records and contact info' },
  {
    key: 'vehicles',
    label: 'Vehicles & Service Records',
    description: 'Vehicles, notes, fuel logs, reminders, service records',
  },
  { key: 'quotes', label: 'Quotes', description: 'Quotes with parts and labor' },
  { key: 'inventory', label: 'Inventory', description: 'Inventory parts and stock levels' },
  {
    key: 'customFields',
    label: 'Custom Fields',
    description: 'Custom field definitions and values',
  },
  { key: 'files', label: 'Uploaded Files', description: 'Images, service attachments, logo' },
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

export function DataSettings() {
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
      modal.open('success', 'Export Complete', 'Your backup file has been downloaded.')
    } catch {
      modal.open('error', 'Export Failed', 'Could not export your data. Please try again.')
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
      modal.open('success', 'Import Complete', 'All data has been restored from the backup file.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed'
      modal.open('error', 'Import Failed', message)
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
        'LubeLog Import Complete',
        `Imported ${result.imported.vehicles} vehicles, ${result.imported.serviceRecords} service records, and ${result.imported.notes} notes.`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed'
      modal.open('error', 'Import Failed', message)
    }
    setImportingLubelog(false)
  }

  // ── Invoice Ninja import dialog ──────────────────────────────────────────
  const invoiceNinjaInputRef = useRef<HTMLInputElement>(null)
  const [invoiceNinjaOpen, setInvoiceNinjaOpen] = useState(false)
  const [invoiceNinjaFile, setInvoiceNinjaFile] = useState<File | null>(null)
  const [importingInvoiceNinja, setImportingInvoiceNinja] = useState(false)

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
        'Invoice Ninja Import Complete',
        `Imported ${result.imported.customers} customers, ${result.imported.products} products, ${result.imported.invoices} invoices, ${result.imported.documents} documents, and ${result.imported.payments} payments.`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed'
      modal.open('error', 'Import Failed', message)
    }
    setImportingInvoiceNinja(false)
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <h2 className="text-lg font-semibold">Data Management</h2>
        <p className="text-sm text-muted-foreground">
          Export your data as a backup or import a previously exported file.
        </p>
      </div>

      <ReadOnlyWrapper>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Export Card */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Download className="h-4 w-4" /> Export Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Download your data as a zip file. Select which categories to include in the backup.
              </p>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Include in backup:</span>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-primary hover:underline"
                  >
                    {allChecked ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="space-y-2">
                  {OPTION_LABELS.map(({ key, label, description }) => (
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
                        <div className="text-sm font-medium leading-none">{label}</div>
                        <div className="text-xs text-muted-foreground">{description}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {options.files && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <FileArchive className="h-3.5 w-3.5 shrink-0" />
                    Includes uploaded files — backup may be larger
                  </p>
                )}
              </div>

              <Button onClick={handleExport} disabled={exporting || noneChecked}>
                {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Download Backup
              </Button>
            </CardContent>
          </Card>

          {/* Import Card */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" /> Import Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Importing will <strong>replace all existing data</strong> with the contents of the
                  backup file. This action cannot be undone.
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
                  Supports both .zip (v2) and .json (v1) backup files.
                </p>
                <Button
                  onClick={handleImport}
                  disabled={!selectedFile || importing}
                  variant="outline"
                >
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload &amp; Restore
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Import from Other Services */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRight className="h-4 w-4" /> Import from Other Services
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Migrate your data from another platform. Select a service to get started.
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
              Import from LubeLog
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">How to export your LubeLog data:</p>
              <ol className="list-inside list-decimal space-y-1.5 text-sm text-muted-foreground">
                <li>Open your LubeLog instance</li>
                <li>
                  Go to <strong className="text-foreground">Settings</strong>
                </li>
                <li>
                  Click <strong className="text-foreground">Make Backup</strong> to download a zip
                  file
                </li>
                <li>Upload the downloaded zip file below</li>
              </ol>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400">
              <FileArchive className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This will <strong>add data alongside</strong> your existing records — nothing will
                be deleted.
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">What will be imported:</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>Vehicles</li>
                <li>Service records with attachments</li>
                <li>Notes</li>
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
              <p className="text-xs text-muted-foreground">Files up to 200MB supported.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setLubelogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleLubeLogImport} disabled={!lubelogFile || importingLubelog}>
                {importingLubelog && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import
              </Button>
            </div>
          </div>
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
              Import from Invoice Ninja
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">How to export your Invoice Ninja data:</p>
              <ol className="list-inside list-decimal space-y-1.5 text-sm text-muted-foreground">
                <li>Open your Invoice Ninja instance</li>
                <li>
                  Go to <strong className="text-foreground">Settings &gt; Import | Export</strong>
                </li>
                <li>
                  Click <strong className="text-foreground">Export</strong> to download a zip file
                </li>
                <li>Upload the downloaded zip file below</li>
              </ol>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400">
              <FileArchive className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This will <strong>add data alongside</strong> your existing records — nothing will
                be deleted.
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">What will be imported:</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>Customers (clients)</li>
                <li>Products (inventory)</li>
                <li>Invoices as service records (parts &amp; labor)</li>
                <li>Documents &amp; attachments</li>
                <li>Payments</li>
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
                Upload an Invoice Ninja zip export file. Files up to 200MB supported.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setInvoiceNinjaOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleInvoiceNinjaImport}
                disabled={!invoiceNinjaFile || importingInvoiceNinja}
              >
                {importingInvoiceNinja && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
