'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { useGlassModal } from '@/components/glass-modal'
import {
  AlertTriangle,
  Download,
  FileArchive,
  Loader2,
  Upload,
} from 'lucide-react'
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
  { key: 'settings', label: 'Settings', description: 'Workshop info, invoice config, payment providers' },
  { key: 'customers', label: 'Customers', description: 'Customer records and contact info' },
  { key: 'vehicles', label: 'Vehicles & Service Records', description: 'Vehicles, notes, fuel logs, reminders, service records' },
  { key: 'quotes', label: 'Quotes', description: 'Quotes with parts and labor' },
  { key: 'inventory', label: 'Inventory', description: 'Inventory parts and stock levels' },
  { key: 'customFields', label: 'Custom Fields', description: 'Custom field definitions and values' },
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
      const res = await fetch('/api/backup/export', {
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
        res = await fetch('/api/backup/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/zip' },
          body: buffer,
        })
      } else {
        const text = await selectedFile.text()
        const json = JSON.parse(text)
        res = await fetch('/api/backup/import', {
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
      </ReadOnlyWrapper>
    </div>
  )
}
