'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Camera,
  FileVideo,
  ImageIcon,
  Loader2,
  Video,
  Wrench,
  Clock,
  Pause,
  Plus,
  ScanBarcode,
  Package,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Badge } from '@/components/ui/badge'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer'
import { toast } from 'sonner'
import { compressImage } from '@/lib/compress-image'
import { addServiceAttachment } from '@/features/vehicles/Actions/addServiceAttachment'
import { addPartToServiceRecord } from '@/features/vehicles/Actions/addPartToServiceRecord'
import { lookupPartByBarcode } from '@/features/inventory/Actions/lookupPartByBarcode'
import { BarcodeScannerDialog } from '@/components/barcode-scanner-dialog'
import { InventoryPartForm } from '@/features/inventory/Components/InventoryPartForm'
import { CreateStatusReportDialog } from '@/features/status-reports/Components/CreateStatusReportDialog'
import { SendStatusReportDialog } from '@/features/status-reports/Components/SendStatusReportDialog'
import type { MyActiveJob } from '@/features/vehicles/Actions/getMyActiveJobs'

interface MyActiveJobsProps {
  jobs: MyActiveJob[]
  smsEnabled: boolean
  emailEnabled: boolean
  telegramEnabled: boolean
}

const STATUS_ICON: Record<string, typeof Wrench> = {
  'in-progress': Wrench,
  pending: Clock,
  'waiting-parts': Pause,
}

const STATUS_COLOR: Record<string, string> = {
  'in-progress': 'bg-blue-500/10 text-blue-600',
  pending: 'bg-amber-500/10 text-amber-600',
  'waiting-parts': 'bg-orange-500/10 text-orange-600',
}

export function MyActiveJobs({ jobs, smsEnabled, emailEnabled, telegramEnabled }: MyActiveJobsProps) {
  const t = useTranslations('dashboard.myJobs')
  const router = useRouter()
  const [uploading, setUploading] = useState<{ jobId: string; type: 'photo' | 'video' } | null>(null)
  const [imageCounts, setImageCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(jobs.map((j) => [j.id, j.imageCount]))
  )
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const videoInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [videoCounts, setVideoCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(jobs.map((j) => [j.id, j.videoCount]))
  )

  // Barcode scanner state
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanJobId, setScanJobId] = useState<string | null>(null)
  const [pendingBarcode, setPendingBarcode] = useState('')
  const [showPartForm, setShowPartForm] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [scannedPart, setScannedPart] = useState<{
    id: string
    name: string
    partNumber: string | null
    barcode: string | null
    quantity: number
    category: string | null
    sellPrice: number
    unitCost: number
  } | null>(null)
  const [addQty, setAddQty] = useState(1)
  const [addingPart, setAddingPart] = useState(false)
  const [partCounts, setPartCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(jobs.map((j) => [j.id, j.partCount]))
  )

  const [statusReportJobId, setStatusReportJobId] = useState<string | null>(null)
  const [sendReportId, setSendReportId] = useState<string | null>(null)
  const [sendReportJobId, setSendReportJobId] = useState<string | null>(null)

  if (jobs.length === 0) return null

  const handleCameraClick = (jobId: string) => {
    fileInputRefs.current[jobId]?.click()
  }

  const handleScanClick = (jobId: string) => {
    setScanJobId(jobId)
    setScannerOpen(true)
  }

  const handleAddPartToJob = async (qty: number) => {
    if (!scannedPart || !scanJobId) return
    setAddingPart(true)
    const price = scannedPart.sellPrice > 0 ? scannedPart.sellPrice : scannedPart.unitCost
    const addResult = await addPartToServiceRecord({
      serviceRecordId: scanJobId,
      partNumber: scannedPart.partNumber || undefined,
      name: scannedPart.name,
      quantity: qty,
      unitPrice: price,
      total: price * qty,
      unitCost: scannedPart.unitCost,
      inventoryPartId: scannedPart.id,
    })
    setAddingPart(false)
    if (addResult.success) {
      toast.success(t('partAdded', { name: scannedPart.name }))
      setPartCounts((prev) => ({ ...prev, [scanJobId]: (prev[scanJobId] || 0) + qty }))
      setShowAddDialog(false)
      router.refresh()
    } else {
      toast.error(addResult.error || t('partAddFailed'))
    }
  }

  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      if (!scanJobId) return
      setScannerOpen(false)

      const result = await lookupPartByBarcode(barcode)
      setPendingBarcode(barcode)
      if (result.success && result.data) {
        setScannedPart(result.data)
        setAddQty(1)
        setShowAddDialog(true)
      } else {
        // Part not found — offer to create it
        setScannedPart(null)
        setShowPartForm(true)
      }
    },
    [scanJobId]
  )

  const handlePartFormClose = useCallback(
    async (open: boolean) => {
      setShowPartForm(open)
      if (!open && pendingBarcode && scanJobId) {
        // After creating a part, look it up and add to job
        const result = await lookupPartByBarcode(pendingBarcode)
        if (result.success && result.data) {
          setScannedPart(result.data)
          setAddQty(1)
          setShowAddDialog(true)
        }
        setPendingBarcode('')
        router.refresh()
      }
    },
    [pendingBarcode, scanJobId, router]
  )

  const handleFileSelect = async (jobId: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading({ jobId, type: 'photo' })

    let uploaded = 0
    for (let i = 0; i < files.length; i++) {
      let file = files[i]
      if (!file.type.startsWith('image/')) continue

      try {
        file = await compressImage(file)
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/protected/upload/service-files', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const err = await res.json()
          toast.error(err.error || t('uploadFailed'))
          continue
        }

        const data = await res.json()
        await addServiceAttachment({
          serviceRecordId: jobId,
          attachment: {
            fileName: data.fileName,
            fileUrl: data.url,
            fileType: data.fileType,
            fileSize: data.fileSize,
            category: 'image',
            includeInInvoice: true,
          },
        })
        uploaded++
      } catch {
        toast.error(t('uploadFailed'))
      }
    }

    if (uploaded > 0) {
      toast.success(t('uploadSuccess', { count: uploaded }))
      setImageCounts((prev) => ({
        ...prev,
        [jobId]: (prev[jobId] || 0) + uploaded,
      }))
      router.refresh()
    }

    setUploading(null)
    const input = fileInputRefs.current[jobId]
    if (input) input.value = ''
  }

  const handleVideoSelect = async (jobId: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading({ jobId, type: 'video' })

    let uploaded = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith('video/')) continue

      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/protected/upload/service-files', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const err = await res.json()
          toast.error(err.error || t('uploadFailed'))
          continue
        }

        const data = await res.json()
        await addServiceAttachment({
          serviceRecordId: jobId,
          attachment: {
            fileName: data.fileName,
            fileUrl: data.url,
            fileType: data.fileType,
            fileSize: data.fileSize,
            category: 'video',
            includeInInvoice: false,
          },
        })
        uploaded++
      } catch {
        toast.error(t('uploadFailed'))
      }
    }

    if (uploaded > 0) {
      toast.success(t('videoUploadSuccess', { count: uploaded }))
      setVideoCounts((prev) => ({
        ...prev,
        [jobId]: (prev[jobId] || 0) + uploaded,
      }))
      router.refresh()
    }

    setUploading(null)
    const vinput = videoInputRefs.current[jobId]
    if (vinput) vinput.value = ''
  }

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="px-4 pb-1 pt-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            {t('title')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {jobs.map((job) => {
              const StatusIcon = STATUS_ICON[job.status] || Wrench
              const statusColor = STATUS_COLOR[job.status] || 'bg-muted text-muted-foreground'
              const isUploadingPhoto = uploading?.jobId === job.id && uploading.type === 'photo'
              const isUploadingVideo = uploading?.jobId === job.id && uploading.type === 'video'
              const isUploading = uploading?.jobId === job.id
              const imgCount = imageCounts[job.id] || 0
              const vidCount = videoCounts[job.id] || 0
              const prtCount = partCounts[job.id] || 0

              return (
                <div key={job.id} className="px-4 py-2">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-80"
                      onClick={() => router.push(`/vehicles/${job.vehicleId}/service/${job.id}`)}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${statusColor}`}
                      >
                        <StatusIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{job.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
                          {job.vehicle.licensePlate && ` · ${job.vehicle.licensePlate}`}
                        </p>
                      </div>
                    </div>
                    {/* Desktop: inline buttons */}
                    <div className="shrink-0 ml-3 hidden sm:flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {imgCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <ImageIcon className="h-3 w-3" />
                            {imgCount}
                          </span>
                        )}
                        {vidCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Video className="h-3 w-3" />
                            {vidCount}
                          </span>
                        )}
                        {prtCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Package className="h-3 w-3" />
                            {prtCount}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        disabled={isUploading}
                        onClick={() => handleCameraClick(job.id)}
                      >
                        {isUploadingPhoto ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Camera className="mr-1.5 h-4 w-4" />
                        )}
                        {t('addPhoto')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        disabled={isUploading}
                        onClick={() => videoInputRefs.current[job.id]?.click()}
                      >
                        {isUploadingVideo ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Video className="mr-1.5 h-4 w-4" />
                        )}
                        {t('addVideo')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => handleScanClick(job.id)}
                      >
                        <ScanBarcode className="mr-1.5 h-4 w-4" />
                        {t('scanPart')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => setStatusReportJobId(job.id)}
                      >
                        <FileVideo className="mr-1.5 h-4 w-4" />
                        {t('statusReport')}
                      </Button>
                    </div>
                    {/* Mobile: counters only */}
                    <div className="shrink-0 ml-3 flex sm:hidden items-center gap-1.5 text-xs text-muted-foreground">
                      {imgCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <ImageIcon className="h-3 w-3" />
                          {imgCount}
                        </span>
                      )}
                      {vidCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Video className="h-3 w-3" />
                          {vidCount}
                        </span>
                      )}
                      {prtCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Package className="h-3 w-3" />
                          {prtCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Mobile: action buttons on two rows */}
                  <div className="mt-2 flex flex-col gap-1.5 sm:hidden">
                    <ButtonGroup className="w-full">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9"
                        disabled={isUploading}
                        onClick={() => handleCameraClick(job.id)}
                      >
                        {isUploadingPhoto ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Camera className="mr-1 h-3.5 w-3.5" />
                        )}
                        {t('photo')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9"
                        disabled={isUploading}
                        onClick={() => videoInputRefs.current[job.id]?.click()}
                      >
                        {isUploadingVideo ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Video className="mr-1 h-3.5 w-3.5" />
                        )}
                        {t('video')}
                      </Button>
                    </ButtonGroup>
                    <ButtonGroup className="w-full">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9"
                        onClick={() => handleScanClick(job.id)}
                      >
                        <ScanBarcode className="mr-1 h-3.5 w-3.5" />
                        {t('parts')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9"
                        onClick={() => setStatusReportJobId(job.id)}
                      >
                        <FileVideo className="mr-1 h-3.5 w-3.5" />
                        {t('report')}
                      </Button>
                    </ButtonGroup>
                  </div>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[job.id] = el
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileSelect(job.id, e.target.files)}
                  />
                  <input
                    ref={(el) => {
                      videoInputRefs.current[job.id] = el
                    }}
                    type="file"
                    accept="video/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleVideoSelect(job.id, e.target.files)}
                  />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleBarcodeScan}
        title={t('scanPart')}
      />

      {/* Quantity selection drawer when part is found */}
      <Drawer open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t('scanPart')}</DrawerTitle>
          </DrawerHeader>
          {scannedPart && (
            <div className="px-4">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{scannedPart.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {scannedPart.partNumber && <span className="font-mono text-xs">{scannedPart.partNumber}</span>}
                    {scannedPart.category && <Badge variant="secondary" className="text-[10px]">{scannedPart.category}</Badge>}
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground shrink-0">
                  {t('inStock', { quantity: scannedPart.quantity })}
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 py-6">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-full text-lg"
                  onClick={() => setAddQty(Math.max(1, addQty - 1))}
                  disabled={addingPart || addQty <= 1}
                >
                  -
                </Button>
                <span className="w-16 text-center text-3xl font-semibold tabular-nums">{addQty}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-full text-lg"
                  onClick={() => setAddQty(addQty + 1)}
                  disabled={addingPart}
                >
                  +
                </Button>
              </div>
            </div>
          )}
          <DrawerFooter>
            <Button
              size="lg"
              className="w-full"
              onClick={() => handleAddPartToJob(addQty)}
              disabled={addingPart}
            >
              {addingPart ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {t('addToJob', { qty: addQty })}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Full part form for creating new parts */}
      <InventoryPartForm
        key={pendingBarcode || 'job-new'}
        open={showPartForm}
        onOpenChange={handlePartFormClose}
        initialBarcode={pendingBarcode}
      />

      {statusReportJobId && (() => {
        const job = jobs.find(j => j.id === statusReportJobId)
        if (!job) return null
        return (
          <CreateStatusReportDialog
            open={!!statusReportJobId}
            onOpenChange={(open) => { if (!open) setStatusReportJobId(null) }}
            serviceRecordId={statusReportJobId}
            vehicleName={`${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}`}
            customer={job.customer}
            smsEnabled={smsEnabled}
            emailEnabled={emailEnabled}
            telegramEnabled={telegramEnabled}
            onCreated={(reportId) => {
              const currentJobId = statusReportJobId
              setStatusReportJobId(null)
              if (job.customer) {
                setSendReportId(reportId)
                setSendReportJobId(currentJobId)
              }
            }}
          />
        )
      })()}

      {sendReportId && (() => {
        const job = sendReportJobId ? jobs.find(j => j.id === sendReportJobId) : null
        if (!job?.customer) return null
        return (
          <SendStatusReportDialog
            open={!!sendReportId}
            onOpenChange={(open) => { if (!open) { setSendReportId(null); setSendReportJobId(null) } }}
            reportId={sendReportId}
            customer={job.customer}
            smsEnabled={smsEnabled}
            emailEnabled={emailEnabled}
            telegramEnabled={telegramEnabled}
          />
        )
      })()}
    </>
  )
}
