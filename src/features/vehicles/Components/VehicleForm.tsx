'use client'

import { interactiveRow } from '@/lib/interactive-row'
import { useState, useRef, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DocsLink } from '@/components/docs-link'
import { toast } from 'sonner'
import { useGlassModal } from '@/components/glass-modal'
import { createVehicle, updateVehicle } from '../Actions/vehicleActions'
import type { VehicleDocumentScan } from '../Actions/aiAnalyzeVehicleDocument'
import { ScanDocumentButton } from './ScanDocumentButton'
import { nameSimilarity } from '@/lib/name-similarity'
import { Camera, Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react'
import { compressImage } from '@/lib/compress-image'
import { CustomerForm } from '@/features/customers/Components/CustomerForm'
import { useTranslations } from 'next-intl'
import { useServiceType } from '@/components/service-type-context'
import type { CreateVehicleInput } from '../Schema/vehicleSchema'

/**
 * How alike two names must read before the scanned keeper is offered as an
 * existing customer rather than a new one.
 */
const OWNER_MATCH_THRESHOLD = 0.9

interface OwnerMatch {
  customer: { id: string; name: string; company: string | null }
  score: number
}

interface VehicleFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicle?: {
    id: string
    make: string
    model: string
    year: number
    vin?: string | null
    licensePlate?: string | null
    color?: string | null
    mileage: number
    fuelType?: string | null
    transmission?: string | null
    engineSize?: string | null
    engineCode?: string | null
    imageUrl?: string | null
    customerId?: string | null
  }
  customers?: { id: string; name: string; company: string | null }[]
  /** Preselects the customer when creating a new vehicle (ignored when editing) */
  defaultCustomerId?: string
}

export function VehicleForm({
  open,
  onOpenChange,
  vehicle,
  customers,
  defaultCustomerId,
}: VehicleFormProps) {
  const serviceType = useServiceType()
  const isMarine = serviceType === 'marine'
  const router = useRouter()
  const modal = useGlassModal()
  const t = useTranslations('vehicles.form')
  const tc = useTranslations('common.buttons')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<string | null>(vehicle?.imageUrl ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    vehicle?.customerId || defaultCustomerId || 'none'
  )
  const [customerOpen, setCustomerOpen] = useState(false)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [localCustomers, setLocalCustomers] = useState(customers || [])
  const [fuelType, setFuelType] = useState(vehicle?.fuelType ?? 'gasoline')
  /** Keeper read off a scanned document, until it is tied to a customer. */
  const [scannedOwner, setScannedOwner] = useState<{ name?: string; address?: string } | null>(null)
  const [ownerMatches, setOwnerMatches] = useState<OwnerMatch[]>([])
  const [showOwnerMatch, setShowOwnerMatch] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Sync state when vehicle prop changes (e.g. opening edit for a different vehicle)
  useEffect(() => {
    setSelectedCustomerId(vehicle?.customerId || defaultCustomerId || 'none')
    setPreview(vehicle?.imageUrl ?? null)
    setImageFile(null)
    setFuelType(vehicle?.fuelType ?? 'gasoline')
    setScannedOwner(null)
    setOwnerMatches([])
  }, [vehicle?.id, vehicle?.customerId, vehicle?.imageUrl, vehicle?.fuelType, defaultCustomerId])

  const selectedCustomerLabel = useMemo(() => {
    if (!selectedCustomerId || selectedCustomerId === 'none') return t('noCustomer')
    const c = localCustomers.find((c) => c.id === selectedCustomerId)
    if (!c) return t('noCustomer')
    return c.name + (c.company ? ` (${c.company})` : '')
  }, [selectedCustomerId, localCustomers, t])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      modal.open('error', t('imageTooLarge'), t('maxFileSize'))
      return
    }

    setImageFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    setImageFile(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const uploadImage = async (): Promise<string | undefined> => {
    if (!imageFile) return preview ?? undefined

    const toastId = toast.loading(t('uploadingImage'))
    const compressed = await compressImage(imageFile)
    const formData = new FormData()
    formData.append('file', compressed)

    const res = await fetch('/api/protected/upload', { method: 'POST', body: formData })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error || t('uploadFailed'), { id: toastId })
      throw new Error(err.error || t('uploadFailed'))
    }

    const { url } = await res.json()
    toast.success(t('imageUploaded'), { id: toastId })
    return url
  }

  const applyScan = (data: VehicleDocumentScan) => {
    const form = formRef.current
    if (!form) return

    const setIfEmpty = (name: string, value: string | undefined) => {
      if (!value) return
      const input = form.elements.namedItem(name) as HTMLInputElement | null
      if (input && !input.value) input.value = value
    }

    setIfEmpty('make', data.make)
    setIfEmpty('model', data.model)
    setIfEmpty('year', data.year ? String(data.year) : undefined)
    setIfEmpty('vin', data.vin)
    setIfEmpty('licensePlate', data.licensePlate)
    setIfEmpty('color', data.color)
    setIfEmpty('engineSize', data.engineSize)

    // A select has no empty state, so only fill it while it still holds the
    // value the form opened with.
    if (data.fuelType && fuelType === (vehicle?.fuelType ?? 'gasoline')) {
      setFuelType(data.fuelType)
    }

    if (!data.owner?.name || selectedCustomerId !== 'none') return
    setScannedOwner(data.owner)

    // Near-identical names are still a judgement call: two brothers at one
    // address differ by a first name. Offer the close ones and let the user say.
    const ownerName = data.owner.name
    const candidates = localCustomers
      .map((c) => ({
        customer: c,
        // Papers naming a business may match the company field rather than the
        // contact saved as the customer's name.
        score: Math.max(
          nameSimilarity(ownerName, c.name),
          c.company ? nameSimilarity(ownerName, c.company) : 0
        ),
      }))
      .filter((m) => m.score >= OWNER_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    setOwnerMatches(candidates)
    if (candidates.length > 0) setShowOwnerMatch(true)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setLoading(true)

    try {
      let imageUrl: string | undefined
      try {
        imageUrl = await uploadImage()
      } catch (err) {
        modal.open(
          'error',
          'Upload Failed',
          err instanceof Error ? err.message : 'Could not upload image'
        )
        setLoading(false)
        return
      }

      const data: CreateVehicleInput & { imageUrl?: string } = {
        make: formData.get('make') as string,
        model: formData.get('model') as string,
        year: Number(formData.get('year')),
        vin: (formData.get('vin') as string) || undefined,
        licensePlate: (formData.get('licensePlate') as string) || undefined,
        color: (formData.get('color') as string) || undefined,
        mileage: Number(formData.get('mileage')) || 0,
        fuelType: fuelType || undefined,
        transmission: (formData.get('transmission') as string) || undefined,
        engineSize: (formData.get('engineSize') as string) || undefined,
        engineCode: (formData.get('engineCode') as string) || undefined,
        customerId: selectedCustomerId === 'none' ? undefined : selectedCustomerId || undefined,
      }

      const payload = imageUrl ? { ...data, imageUrl } : data

      const result = vehicle
        ? await updateVehicle({ ...payload, id: vehicle.id })
        : await createVehicle(payload)

      if (result.success) {
        toast.success(vehicle ? t('vehicleUpdated') : t('vehicleAdded'))
        onOpenChange(false)
        setImageFile(null)
        router.refresh()
      } else {
        modal.open('error', 'Error', result.error || t('saveError'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{vehicle ? t('editTitle') : t('addTitle')}</DialogTitle>
            <DocsLink href="/docs/features/vehicles" variant="hint" className="self-start" />
            <DialogDescription className="sr-only">
              {vehicle ? t('editTitle') : t('addTitle')}
            </DialogDescription>
          </DialogHeader>

          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="grid gap-x-6 gap-y-4 md:grid-cols-2"
          >
            {/* Left: what the vehicle belongs to and where its data comes from */}
            <div className="space-y-4">
              {/* Scan the registration document and fill the form from it */}
              <ScanDocumentButton onScanned={applyScan} />

              {/* Image upload */}
              <div className="space-y-2">
                <Label>{t('photo')}</Label>
                <div
                  {...interactiveRow(() => fileRef.current?.click())}
                  className="group relative flex h-44 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50 hover:bg-muted/50"
                >
                  {preview ? (
                    <>
                      <Image
                        src={preview}
                        alt="Vehicle preview"
                        fill
                        unoptimized
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          clearImage()
                        }}
                        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Camera className="h-8 w-8" />
                      <span className="text-sm">{t('clickToUpload')}</span>
                      <span className="text-xs">{t('imageFormats')}</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </div>

              {/* Customer selector */}
              <div className="space-y-2">
                <Label>{t('customer')}</Label>
                <Popover open={customerOpen} onOpenChange={setCustomerOpen} modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">{selectedCustomerLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t('searchCustomers')} />
                      <CommandList className="max-h-60 overflow-y-auto">
                        <CommandEmpty>{t('noCustomerFound')}</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="no-customer"
                            onSelect={() => {
                              setSelectedCustomerId('none')
                              setCustomerOpen(false)
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${selectedCustomerId === 'none' ? 'opacity-100' : 'opacity-0'}`}
                            />
                            {t('noCustomer')}
                          </CommandItem>
                          {localCustomers.map((c) => {
                            const label = c.name + (c.company ? ` (${c.company})` : '')
                            return (
                              <CommandItem
                                key={c.id}
                                value={label}
                                onSelect={() => {
                                  setSelectedCustomerId(c.id)
                                  setCustomerOpen(false)
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${selectedCustomerId === c.id ? 'opacity-100' : 'opacity-0'}`}
                                />
                                {label}
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                      <div className="border-t p-1">
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                          onClick={() => {
                            setCustomerOpen(false)
                            setShowCustomerForm(true)
                          }}
                        >
                          <Plus className="h-4 w-4" />
                          {t('addCustomer')}
                        </button>
                      </div>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Keeper read off the papers who matches no customer yet */}
                {scannedOwner?.name && selectedCustomerId === 'none' && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{t('ownerFromDocument')}</p>
                      <p className="truncate text-sm font-medium">{scannedOwner.name}</p>
                      {scannedOwner.address && (
                        <p className="truncate text-xs text-muted-foreground">
                          {scannedOwner.address}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() =>
                        ownerMatches.length > 0
                          ? setShowOwnerMatch(true)
                          : setShowCustomerForm(true)
                      }
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {ownerMatches.length > 0
                        ? t('ownerMatchChoose')
                        : t('createCustomerFromDocument')}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: the vehicle's own details */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="make">{isMarine ? t('makeMarine') : t('make')}</Label>
                  <Input
                    id="make"
                    name="make"
                    placeholder={isMarine ? 'Boston Whaler' : 'Toyota'}
                    defaultValue={vehicle?.make}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">{t('model')}</Label>
                  <Input
                    id="model"
                    name="model"
                    placeholder={isMarine ? 'Montauk 170' : 'Camry'}
                    defaultValue={vehicle?.model}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="year">{t('year')}</Label>
                  <Input
                    id="year"
                    name="year"
                    type="number"
                    placeholder="2024"
                    defaultValue={vehicle?.year}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mileage">{isMarine ? t('mileageMarine') : t('mileage')}</Label>
                  <Input
                    id="mileage"
                    name="mileage"
                    type="number"
                    placeholder="0"
                    defaultValue={vehicle?.mileage}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vin">{isMarine ? t('vinMarine') : t('vin')}</Label>
                  <Input
                    id="vin"
                    name="vin"
                    placeholder="1HGCM82633A004352"
                    defaultValue={vehicle?.vin ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="licensePlate">
                    {isMarine ? t('licensePlateMarine') : t('licensePlate')}
                  </Label>
                  <Input
                    id="licensePlate"
                    name="licensePlate"
                    placeholder="ABC-1234"
                    defaultValue={vehicle?.licensePlate ?? ''}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="color">{t('color')}</Label>
                  <Input
                    id="color"
                    name="color"
                    placeholder="Silver"
                    defaultValue={vehicle?.color ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fuelType">{t('fuelType')}</Label>
                  <Select name="fuelType" value={fuelType} onValueChange={setFuelType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gasoline">{t('gasoline')}</SelectItem>
                      <SelectItem value="diesel">{t('diesel')}</SelectItem>
                      {!isMarine && (
                        <>
                          <SelectItem value="electric">{t('electric')}</SelectItem>
                          <SelectItem value="hybrid">{t('hybrid')}</SelectItem>
                        </>
                      )}
                      {isMarine && <SelectItem value="two-stroke">{t('twoStroke')}</SelectItem>}
                      <SelectItem value="other">{t('other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transmission">
                  {isMarine ? t('transmissionMarine') : t('transmission')}
                </Label>
                <Select
                  name="transmission"
                  defaultValue={vehicle?.transmission ?? (isMarine ? 'outboard' : 'automatic')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isMarine ? (
                      <>
                        <SelectItem value="outboard">{t('outboard')}</SelectItem>
                        <SelectItem value="inboard">{t('inboard')}</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="automatic">{t('automatic')}</SelectItem>
                        <SelectItem value="manual">{t('manual')}</SelectItem>
                        <SelectItem value="cvt">{t('cvt')}</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="engineSize">
                    {isMarine ? t('engineSizeMarine') : t('engineSize')}
                  </Label>
                  <Input
                    id="engineSize"
                    name="engineSize"
                    placeholder={isMarine ? 'Mercury F 350 XXL Verado V-10 (350 hp)' : '2.5L'}
                    defaultValue={vehicle?.engineSize ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="engineCode">{t('engineCode')}</Label>
                  <Input
                    id="engineCode"
                    name="engineCode"
                    placeholder="2AR-FE"
                    defaultValue={vehicle?.engineCode ?? ''}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t pt-4 md:col-span-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {vehicle ? tc('saveChanges') : t('addTitle')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Close matches for the keeper on the papers */}
      <Dialog open={showOwnerMatch} onOpenChange={setShowOwnerMatch}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ownerMatchTitle')}</DialogTitle>
            <DialogDescription>
              {t('ownerMatchDescription', { name: scannedOwner?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {ownerMatches.map(({ customer, score }) => (
              <button
                key={customer.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
                onClick={() => {
                  setSelectedCustomerId(customer.id)
                  setScannedOwner(null)
                  setShowOwnerMatch(false)
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{customer.name}</span>
                  {customer.company && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {customer.company}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('ownerMatchScore', { percent: Math.round(score * 100) })}
                </span>
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowOwnerMatch(false)}>
              {tc('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowOwnerMatch(false)
                setShowCustomerForm(true)
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('ownerMatchCreateNew')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CustomerForm
        open={showCustomerForm}
        onOpenChange={setShowCustomerForm}
        defaults={scannedOwner ?? undefined}
        onCreated={(created) => {
          setLocalCustomers((prev) => [...prev, created])
          setSelectedCustomerId(created.id)
          setScannedOwner(null)
        }}
      />
    </>
  )
}
