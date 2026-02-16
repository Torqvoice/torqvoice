'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useGlassModal } from '@/components/glass-modal'
import {
  createServiceRecord,
  updateServiceRecord,
} from '@/features/vehicles/Actions/serviceActions'
import { deleteUploadedFile } from '@/features/vehicles/Actions/deleteUploadedFile'
import type {
  ServicePartInput,
  ServiceLaborInput,
  ServiceAttachmentInput,
} from '@/features/vehicles/Schema/serviceSchema'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Check,
  ChevronsUpDown,
  FileText,
  Image as ImageIcon,
  Loader2,
  Package,
  Paperclip,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { formatCurrency, getCurrencySymbol } from '@/lib/format'

interface InventoryPartOption {
  id: string
  partNumber: string | null
  name: string
  unitCost: number
  quantity: number
  category: string | null
}

interface InitialData {
  id: string
  title: string
  description: string
  type: string
  status: string
  mileage: number | null
  serviceDate: string
  techName: string
  diagnosticNotes: string
  invoiceNotes: string
  invoiceNumber?: string
  partItems: ServicePartInput[]
  laborItems: ServiceLaborInput[]
  attachments: (ServiceAttachmentInput & { includeInInvoice?: boolean })[]
  subtotal: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  discountType?: string
  discountValue?: number
  discountAmount?: number
}

interface VehicleOption {
  id: string
  label: string
}

interface ServiceRecordFormProps {
  vehicleId: string
  vehicleName: string
  defaultTaxRate?: number
  taxEnabled?: boolean
  defaultLaborRate?: number
  currencyCode?: string
  initialData?: InitialData
  inventoryParts?: InventoryPartOption[]
  vehicles?: VehicleOption[]
}

const emptyPart = (): ServicePartInput => ({
  partNumber: '',
  name: '',
  quantity: 1,
  unitPrice: 0,
  total: 0,
})

const makeEmptyLabor = (defaultRate: number): ServiceLaborInput => ({
  description: '',
  hours: 0,
  rate: defaultRate,
  total: 0,
})

export function ServiceRecordForm({
  vehicleId,
  vehicleName,
  defaultTaxRate = 0,
  taxEnabled = true,
  defaultLaborRate = 0,
  currencyCode = 'USD',
  initialData,
  inventoryParts = [],
  vehicles = [],
}: ServiceRecordFormProps) {
  const cs = getCurrencySymbol(currencyCode)
  const isEdit = !!initialData
  const router = useRouter()
  const modal = useGlassModal()
  const [loading, setLoading] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicleId)
  const [vehicleOpen, setVehicleOpen] = useState(false)
  const selectedVehicleLabel = useMemo(() => {
    if (!isEdit || vehicles.length === 0) return vehicleName
    const v = vehicles.find((v) => v.id === selectedVehicleId)
    return v?.label || vehicleName
  }, [selectedVehicleId, vehicles, vehicleName, isEdit])
  const [type, setType] = useState(initialData?.type || 'maintenance')
  const [status, setStatus] = useState(initialData?.status || 'completed')
  const [partItems, setPartItems] = useState<ServicePartInput[]>(initialData?.partItems || [])
  const [laborItems, setLaborItems] = useState<ServiceLaborInput[]>(initialData?.laborItems || [])
  const [taxRate, setTaxRate] = useState(initialData?.taxRate ?? defaultTaxRate)
  const [discountType, setDiscountType] = useState<string>(initialData?.discountType || 'none')
  const [discountValue, setDiscountValue] = useState(initialData?.discountValue ?? 0)
  const [serviceImages, setServiceImages] = useState<ServiceAttachmentInput[]>(
    (initialData?.attachments || []).filter((a) => a.category === 'image')
  )
  const [diagnosticReports, setDiagnosticReports] = useState<ServiceAttachmentInput[]>(
    (initialData?.attachments || []).filter((a) => a.category === 'diagnostic')
  )
  const [documents, setDocuments] = useState<ServiceAttachmentInput[]>(
    (initialData?.attachments || []).filter((a) => a.category === 'document')
  )
  const [showInventoryPicker, setShowInventoryPicker] = useState(false)
  const [inventorySearch, setInventorySearch] = useState('')
  const [uploadingImages, setUploadingImages] = useState(false)
  const [uploadingReports, setUploadingReports] = useState(false)
  const [uploadingDocuments, setUploadingDocuments] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const reportInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)

  const partsSubtotal = partItems.reduce((sum, p) => sum + p.total, 0)
  const laborSubtotal = laborItems.reduce((sum, l) => sum + l.total, 0)
  const subtotal = partsSubtotal + laborSubtotal
  const discountAmount =
    discountType === 'percentage'
      ? subtotal * (discountValue / 100)
      : discountType === 'fixed'
        ? Math.min(discountValue, subtotal)
        : 0
  const taxAmount = (subtotal - discountAmount) * (taxRate / 100)
  const totalAmount = subtotal - discountAmount + taxAmount

  const updatePart = useCallback(
    (index: number, field: keyof ServicePartInput, value: string | number) => {
      setPartItems((prev) => {
        const updated = [...prev]
        const part = { ...updated[index], [field]: value }
        if (field === 'quantity' || field === 'unitPrice') {
          part.total = Number(part.quantity) * Number(part.unitPrice)
        }
        updated[index] = part
        return updated
      })
    },
    []
  )

  const updateLabor = useCallback(
    (index: number, field: keyof ServiceLaborInput, value: string | number) => {
      setLaborItems((prev) => {
        const updated = [...prev]
        const labor = { ...updated[index], [field]: value }
        if (field === 'hours' || field === 'rate') {
          labor.total = Number(labor.hours) * Number(labor.rate)
        }
        updated[index] = labor
        return updated
      })
    },
    []
  )

  const compressImage = useCallback((file: File, maxWidth = 1920, quality = 0.8): Promise<File> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.size < 500 * 1024) {
        resolve(file)
        return
      }
      const img = new window.Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width))
          width = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(file)
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file)
              return
            }
            const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
              type: 'image/jpeg',
            })
            resolve(compressed)
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => resolve(file)
      img.src = URL.createObjectURL(file)
    })
  }, [])

  const handleFileUpload = useCallback(
    async (files: FileList | File[], category: 'image' | 'diagnostic' | 'document') => {
      const setUploading =
        category === 'image'
          ? setUploadingImages
          : category === 'diagnostic'
            ? setUploadingReports
            : setUploadingDocuments
      const setList =
        category === 'image'
          ? setServiceImages
          : category === 'diagnostic'
            ? setDiagnosticReports
            : setDocuments
      setUploading(true)
      const totalFiles = Array.from(files).length
      const label = category === 'image' ? 'image' : 'file'
      const toastId = toast.loading(
        `Uploading ${totalFiles} ${label}${totalFiles > 1 ? 's' : ''}...`
      )
      const newAttachments: ServiceAttachmentInput[] = []
      let failCount = 0

      for (let file of Array.from(files)) {
        if (category === 'image' && file.type.startsWith('image/')) {
          file = await compressImage(file)
        }
        const formData = new FormData()
        formData.append('file', file)

        try {
          const res = await fetch('/api/upload/service-files', {
            method: 'POST',
            body: formData,
          })

          if (!res.ok) {
            const err = await res.json()
            toast.error(err.error || `Failed to upload ${file.name}`)
            failCount++
            continue
          }

          const data = await res.json()
          newAttachments.push({
            fileName: data.fileName,
            fileUrl: data.url,
            fileType: data.fileType,
            fileSize: data.fileSize,
            category,
            includeInInvoice: true,
          })
        } catch {
          toast.error(`Failed to upload ${file.name}`)
          failCount++
        }
      }

      if (newAttachments.length > 0) {
        setList((prev) => [...prev, ...newAttachments])
        toast.success(
          `${newAttachments.length} ${label}${newAttachments.length > 1 ? 's' : ''} uploaded`,
          { id: toastId }
        )
      } else if (failCount > 0) {
        toast.error(`Upload failed`, { id: toastId })
      } else {
        toast.dismiss(toastId)
      }
      setUploading(false)
    },
    [compressImage]
  )

  const handleDropImages = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files, 'image')
      }
    },
    [handleFileUpload]
  )

  const handleDropReports = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files, 'diagnostic')
      }
    },
    [handleFileUpload]
  )

  const handleDropDocuments = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files, 'document')
      }
    },
    [handleFileUpload]
  )

  const removeServiceImage = useCallback(
    async (index: number) => {
      const file = serviceImages[index]
      if (file?.fileUrl) {
        try {
          await deleteUploadedFile(file.fileUrl)
        } catch {
          // File may already be gone — still remove from UI
        }
      }
      setServiceImages((prev) => prev.filter((_, i) => i !== index))
    },
    [serviceImages]
  )

  const removeDiagnosticReport = useCallback(
    async (index: number) => {
      const file = diagnosticReports[index]
      if (file?.fileUrl) {
        try {
          await deleteUploadedFile(file.fileUrl)
        } catch {
          // File may already be gone — still remove from UI
        }
      }
      setDiagnosticReports((prev) => prev.filter((_, i) => i !== index))
    },
    [diagnosticReports]
  )

  const removeDocument = useCallback(
    async (index: number) => {
      const file = documents[index]
      if (file?.fileUrl) {
        try {
          await deleteUploadedFile(file.fileUrl)
        } catch {
          // File may already be gone — still remove from UI
        }
      }
      setDocuments((prev) => prev.filter((_, i) => i !== index))
    },
    [documents]
  )

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (type: string) => {
    if (type === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />
    if (type.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-500" />
    return <Paperclip className="h-4 w-4 text-muted-foreground" />
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const payload = {
      vehicleId: isEdit ? selectedVehicleId : vehicleId,
      title: formData.get('title') as string,
      description: (formData.get('description') as string) || undefined,
      type,
      status,
      cost: totalAmount,
      mileage: Number(formData.get('mileage')) || undefined,
      serviceDate: (formData.get('serviceDate') as string) || new Date().toISOString(),
      techName: (formData.get('techName') as string) || undefined,
      diagnosticNotes: (formData.get('diagnosticNotes') as string) || undefined,
      invoiceNotes: (formData.get('invoiceNotes') as string) || undefined,
      ...(isEdit && { invoiceNumber: (formData.get('invoiceNumber') as string) || undefined }),
      partItems: partItems.filter((p) => p.name),
      laborItems: laborItems.filter((l) => l.description),
      attachments: isEdit
        ? undefined
        : [...serviceImages, ...diagnosticReports, ...documents].length > 0
          ? [...serviceImages, ...diagnosticReports, ...documents]
          : undefined,
      subtotal,
      taxRate,
      taxAmount,
      totalAmount,
      discountType: discountType === 'none' ? undefined : discountType,
      discountValue,
      discountAmount,
    }

    const result = isEdit
      ? await updateServiceRecord({ id: initialData.id, ...payload })
      : await createServiceRecord(payload)

    if (result.success) {
      toast.success(isEdit ? 'Service record updated' : 'Service record created')
      if (isEdit) {
        if (selectedVehicleId !== vehicleId) {
          router.push(`/vehicles/${selectedVehicleId}/service/${initialData.id}`)
        } else {
          router.refresh()
        }
      } else if (result.data?.id) {
        router.push(`/vehicles/${vehicleId}/service/${result.data.id}/edit`)
        router.refresh()
      } else {
        router.push(`/vehicles/${vehicleId}`)
        router.refresh()
      }
    } else {
      modal.open(
        'error',
        'Error',
        result.error || `Failed to ${isEdit ? 'update' : 'create'} service record`
      )
    }

    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <form id="service-record-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Top row: Basic Info | (Diagnostic Notes if new) | Totals */}
        <div className={`grid grid-cols-1 gap-6 ${isEdit ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
          {/* Column 1: Basic Info */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isEdit && vehicles.length > 0 && (
                <div className="space-y-2">
                  <Label>Vehicle</Label>
                  <Popover open={vehicleOpen} onOpenChange={setVehicleOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={vehicleOpen}
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate">{selectedVehicleLabel}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search vehicles..." />
                        <CommandList className="max-h-60 overflow-y-auto">
                          <CommandEmpty>No vehicle found.</CommandEmpty>
                          <CommandGroup>
                            {vehicles.map((v) => (
                              <CommandItem
                                key={v.id}
                                value={v.label}
                                onSelect={() => {
                                  setSelectedVehicleId(v.id)
                                  setVehicleOpen(false)
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${selectedVehicleId === v.id ? 'opacity-100' : 'opacity-0'}`}
                                />
                                {v.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Oil Change"
                  defaultValue={initialData?.title || ''}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="serviceDate">Date</Label>
                  <Input
                    id="serviceDate"
                    name="serviceDate"
                    type="date"
                    defaultValue={
                      initialData?.serviceDate || new Date().toISOString().split('T')[0]
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="repair">Repair</SelectItem>
                      <SelectItem value="upgrade">Upgrade</SelectItem>
                      <SelectItem value="inspection">Inspection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="mileage">Mileage</Label>
                  <Input
                    id="mileage"
                    name="mileage"
                    type="number"
                    placeholder="50000"
                    defaultValue={initialData?.mileage ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="waiting-parts">Waiting Parts</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="techName">Technician</Label>
                <Input
                  id="techName"
                  name="techName"
                  placeholder="Mike Johnson"
                  defaultValue={initialData?.techName || ''}
                />
              </div>
              {isEdit && (
                <div className="space-y-2">
                  <Label htmlFor="invoiceNumber">Invoice Number</Label>
                  <Input
                    id="invoiceNumber"
                    name="invoiceNumber"
                    placeholder="2026-1001"
                    defaultValue={initialData?.invoiceNumber || ''}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column 2: Diagnostic Notes + Additional Notes — only in new mode (in top row) */}
          {!isEdit && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Diagnostic Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  name="diagnosticNotes"
                  placeholder="Diagnostic findings, observations, recommendations..."
                  rows={8}
                  defaultValue=""
                />
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Invoice Notes</Label>
                  <Textarea
                    name="invoiceNotes"
                    placeholder="Notes for the customer, e.g. recommended future repairs..."
                    rows={4}
                    defaultValue=""
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown on the invoice to the customer
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Internal Notes</Label>
                  <Textarea
                    name="description"
                    placeholder="Internal notes (not shown on invoice)..."
                    rows={4}
                    defaultValue=""
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Totals */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Totals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Parts Subtotal</span>
                  <span>{formatCurrency(partsSubtotal, currencyCode)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Labor Subtotal</span>
                  <span>{formatCurrency(laborSubtotal, currencyCode)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal, currencyCode)}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Discount</span>
                      <Select value={discountType} onValueChange={setDiscountType}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="fixed">Fixed</SelectItem>
                        </SelectContent>
                      </Select>
                      {discountType !== 'none' && (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(Number(e.target.value))}
                          className="h-7 w-20 text-right text-xs"
                        />
                      )}
                      {discountType === 'percentage' && (
                        <span className="text-muted-foreground">%</span>
                      )}
                    </div>
                    {discountAmount > 0 && (
                      <span className="text-destructive">
                        {formatCurrency(-discountAmount, currencyCode)}
                      </span>
                    )}
                  </div>
                </div>
                {taxEnabled && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Tax</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={taxRate}
                        onChange={(e) => setTaxRate(Number(e.target.value))}
                        className="h-7 w-20 text-right text-xs"
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                    <span>{formatCurrency(taxAmount, currencyCode)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t pt-3 text-lg font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(totalAmount, currencyCode)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Parts Table — full width */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Parts</CardTitle>
            <div className="flex gap-2">
              {inventoryParts.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInventorySearch('')
                    setShowInventoryPicker(true)
                  }}
                >
                  <Package className="mr-1 h-3.5 w-3.5" />
                  From Inventory
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPartItems([...partItems, emptyPart()])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Part
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {partItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No parts added yet</p>
            ) : (
              <div className="space-y-3">
                <div className="hidden grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                  <span>Part #</span>
                  <span>Name</span>
                  <span>Qty</span>
                  <span>Unit Price</span>
                  <span>Total</span>
                  <span />
                </div>
                {partItems.map((part, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto]"
                  >
                    <Input
                      placeholder="Part #"
                      value={part.partNumber ?? ''}
                      onChange={(e) => updatePart(i, 'partNumber', e.target.value)}
                    />
                    <Textarea
                      placeholder="Name *"
                      value={part.name}
                      onChange={(e) => updatePart(i, 'name', e.target.value)}
                      rows={1}
                      className="min-h-9 resize-none"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={part.quantity}
                      onChange={(e) => updatePart(i, 'quantity', Number(e.target.value))}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={part.unitPrice}
                      onChange={(e) => updatePart(i, 'unitPrice', Number(e.target.value))}
                    />
                    <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">
                      {formatCurrency(part.total, currencyCode)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => setPartItems(partItems.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <button
                  type="button"
                  className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                  onClick={() => setPartItems([...partItems, emptyPart()])}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <div className="flex justify-end pt-2 text-sm">
                  <span className="font-medium">
                    Parts Subtotal: {formatCurrency(partsSubtotal, currencyCode)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Labor Table — full width */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Labor</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLaborItems([...laborItems, makeEmptyLabor(defaultLaborRate)])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Labor
            </Button>
          </CardHeader>
          <CardContent>
            {laborItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No labor added yet</p>
            ) : (
              <div className="space-y-3">
                <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                  <span>Description</span>
                  <span>Hours</span>
                  <span>Rate ({cs}/hr)</span>
                  <span>Total</span>
                  <span />
                </div>
                {laborItems.map((labor, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
                  >
                    <Textarea
                      placeholder="Description *"
                      value={labor.description}
                      onChange={(e) => updateLabor(i, 'description', e.target.value)}
                      rows={1}
                      className="col-span-2 min-h-9 resize-none sm:col-span-1"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={labor.hours}
                      onChange={(e) => updateLabor(i, 'hours', Number(e.target.value))}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={labor.rate}
                      onChange={(e) => updateLabor(i, 'rate', Number(e.target.value))}
                    />
                    <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">
                      {formatCurrency(labor.total, currencyCode)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => setLaborItems(laborItems.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <button
                  type="button"
                  className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                  onClick={() => setLaborItems([...laborItems, makeEmptyLabor(defaultLaborRate)])}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <div className="flex justify-end pt-2 text-sm">
                  <span className="font-medium">
                    Labor Subtotal: {formatCurrency(laborSubtotal, currencyCode)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagnostic Notes — shown at bottom in edit mode */}
        {isEdit && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Diagnostic Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                name="diagnosticNotes"
                placeholder="Diagnostic findings, observations, recommendations..."
                rows={8}
                defaultValue={initialData?.diagnosticNotes || ''}
              />
              <div className="space-y-2">
                <Label className="text-base font-semibold">Invoice Notes</Label>
                <Textarea
                  name="invoiceNotes"
                  placeholder="Notes for the customer, e.g. recommended future repairs..."
                  rows={4}
                  defaultValue={initialData?.invoiceNotes || ''}
                />
                <p className="text-xs text-muted-foreground">
                  Shown on the invoice to the customer
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-base font-semibold">Internal Notes</Label>
                <Textarea
                  name="description"
                  placeholder="Internal notes (not shown on invoice)..."
                  rows={4}
                  defaultValue={initialData?.description || ''}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-8">
          <Button type="button" variant="outline" asChild>
            <Link href={`/vehicles/${vehicleId}`}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Update Service Record' : 'Create Service Record'}
          </Button>
        </div>
      </form>

      {/* Inventory Part Picker Dialog */}
      <Dialog open={showInventoryPicker} onOpenChange={setShowInventoryPicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Part from Inventory</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search inventory..."
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-75 overflow-y-auto space-y-1">
            {inventoryParts
              .filter((p) => {
                if (!inventorySearch) return true
                const q = inventorySearch.toLowerCase()
                return (
                  p.name.toLowerCase().includes(q) ||
                  (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
                  (p.category && p.category.toLowerCase().includes(q))
                )
              })
              .map((ip) => (
                <button
                  key={ip.id}
                  type="button"
                  className="w-full text-left rounded-md p-2.5 hover:bg-accent transition-colors"
                  onClick={() => {
                    setPartItems((prev) => [
                      ...prev,
                      {
                        partNumber: ip.partNumber || '',
                        name: ip.name,
                        quantity: 1,
                        unitPrice: ip.unitCost,
                        total: ip.unitCost,
                        inventoryPartId: ip.id,
                      },
                    ])
                    setShowInventoryPicker(false)
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm">{ip.name}</span>
                      {ip.partNumber && (
                        <span className="ml-2 text-xs font-mono text-muted-foreground">
                          {ip.partNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{ip.quantity} in stock</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {ip.category && <span>{ip.category}</span>}
                    <span>{formatCurrency(ip.unitCost, currencyCode)}</span>
                  </div>
                </button>
              ))}
            {inventoryParts.filter((p) => {
              if (!inventorySearch) return true
              const q = inventorySearch.toLowerCase()
              return (
                p.name.toLowerCase().includes(q) ||
                (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
                (p.category && p.category.toLowerCase().includes(q))
              )
            }).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No inventory parts found.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
