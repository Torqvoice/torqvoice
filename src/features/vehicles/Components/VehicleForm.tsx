'use client'

import { useEngineSizeUnit } from '@/components/engine-size-context'
import { engineSizeHint, engineSizePlaceholder, engineSizeToSave } from '@/lib/engine-size'
import { useState, useRef, useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { DocsLink } from '@/components/docs-link'
import { toast } from 'sonner'
import { useGlassModal } from '@/components/glass-modal'
import { useDateSettings } from '@/components/date-settings-context'
import { inspectionDueInput } from '../Lib/inspectionDueInput'
import type { RegistryLookup } from '../Lib/registryLookup'
import { createVehicle, updateVehicle } from '../Actions/vehicleActions'
import type { VehicleDocumentScan } from '../Actions/aiAnalyzeVehicleDocument'
import { ScanDocumentButton } from './ScanDocumentButton'
import { VehicleLookupButton } from './VehicleLookupButton'
import type { VehicleLookup } from '@/features/integrations/Actions/vehicleLookupActions'
import { nameSimilarity } from '@/lib/name-similarity'
import { Camera, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { compressImage } from '@/lib/compress-image'
import { CustomerForm } from '@/features/customers/Components/CustomerForm'
import {
  createCustomer,
  findOwnerCandidates,
  getCustomerOption,
} from '@/features/customers/Actions/customerActions'
import { CustomerCombobox } from '@/features/quotes/Components/CustomerCombobox'
import { useFormatter, useTranslations } from 'next-intl'
import { useServiceType } from '@/components/service-type-context'
import type { CreateVehicleInput } from '../Schema/vehicleSchema'
import { clearableInput } from '@/lib/clearable'
import { useTypeKeyEnabled } from '@/components/type-key-context'
import { HSN_PATTERN, normalizeHsn, normalizeTsn, TSN_PATTERN } from '../Lib/typeKey'
import { handleGated } from '@/components/upgrade-gate'
import { PlateChip } from '@/components/plate-chip'
import { StatusLamp, type LampTone } from '@/components/status-lamp'
import { cn } from '@/lib/utils'
import { PhotoHandoffButton } from './service-page/PhotoHandoffButton'

/**
 * How alike two names must read before the scanned keeper is offered as an
 * existing customer rather than a new one.
 */
const OWNER_MATCH_THRESHOLD = 0.9

interface CustomerOption {
  id: string
  name: string
  company: string | null
}

interface OwnerMatch {
  customer: CustomerOption
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
    hsn?: string | null
    tsn?: string | null
    imageUrl?: string | null
    customerId?: string | null
    /** The owner, so the selector can name them without loading every customer */
    customer?: CustomerOption | null
    inspectionStatus?: { dueAt: Date | string | null; source?: string } | null
  }
  /** Preselects the customer when creating a new vehicle (ignored when editing) */
  defaultCustomerId?: string
  /** The preselected customer itself, when the caller has it, to name it without a lookup */
  defaultCustomer?: CustomerOption | null
  /**
   * What a registry already said about the plate, for a form opened from the
   * plate lookup: filled in as if the search button had been pressed.
   */
  initialLookup?: VehicleLookup | null
  /**
   * Offers "Delete vehicle" in the footer, for a page that has its own
   * confirmation to hand the delete to. Left out where nothing should be deleted.
   */
  onDelete?: () => void
  /** "km" or "mi", where the caller knows it, shown beside the mileage. */
  distanceUnit?: string
}

export function VehicleForm({
  open,
  onOpenChange,
  vehicle,
  defaultCustomerId,
  defaultCustomer,
  initialLookup,
  onDelete,
  distanceUnit,
}: VehicleFormProps) {
  const serviceType = useServiceType()
  const isMarine = serviceType === 'marine'
  // Only a workshop that switched the type key on sees the two boxes; a hidden
  // pair is left out of the save, so what a vehicle already has is kept.
  const showTypeKey = useTypeKeyEnabled() && !isMarine
  const router = useRouter()
  const modal = useGlassModal()
  const t = useTranslations('vehicles.form')
  const tDetail = useTranslations('vehicles.detail')
  const { timezone } = useDateSettings()
  const tc = useTranslations('common.buttons')
  const format = useFormatter()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<string | null>(vehicle?.imageUrl ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    vehicle?.customerId || defaultCustomerId || 'none'
  )
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  // The customer list is searched on the server: a workshop can have tens of
  // thousands, and loading them all slowed every page that offers this form.
  const initialCustomer =
    vehicle?.customer ??
    (!vehicle && defaultCustomer?.id === defaultCustomerId ? defaultCustomer : null) ??
    null
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(initialCustomer)
  const [fuelType, setFuelType] = useState(vehicle?.fuelType ?? 'gasoline')
  const defaultTransmission = vehicle?.transmission ?? (isMarine ? 'outboard' : 'automatic')
  const [transmission, setTransmission] = useState(defaultTransmission)
  /** What the registry said about the plate, kept under the field until the dialog closes. */
  const [lookupNote, setLookupNote] = useState<VehicleLookup | null>(null)
  // The registry lookup made on this form, sent with the save so the answer
  // is stored as the registry's, checked now, and not looked up again. The
  // server keeps it only while the plate or VIN it was about is still the one saved.
  const lookupRef = useRef<RegistryLookup | null>(null)
  /** The inspection date the form opened with; a field still holding it was not edited. */
  const openedInspectionDue = vehicle?.inspectionStatus?.dueAt
    ? inspectionDueInput(vehicle.inspectionStatus.dueAt, vehicle.inspectionStatus.source, timezone)
    : ''
  const fieldValue = (name: string) =>
    (formRef.current?.elements.namedItem(name) as HTMLInputElement | null)?.value ?? ''
  /** Keeper read off a scanned document, until it is tied to a customer. */
  const [scannedOwner, setScannedOwner] = useState<{ name?: string; address?: string } | null>(null)
  const [ownerMatches, setOwnerMatches] = useState<OwnerMatch[]>([])
  /** Whether saving should also create the keeper as a customer. */
  const [addOwner, setAddOwner] = useState(true)
  const [showOwnerMatch, setShowOwnerMatch] = useState(false)
  // The keeper is looked up on the server. Saving waits for the answer, or a
  // quick save would add them again; a newer scan, another vehicle or closing
  // the form makes an answer still on its way stale, and it is dropped.
  const [ownerLookupPending, setOwnerLookupPending] = useState(false)
  const ownerLookupRef = useRef(0)
  const dropOwnerLookup = () => {
    ownerLookupRef.current++
    setOwnerLookupPending(false)
    setShowOwnerMatch(false)
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // What a few fields hold right now, for the summary at the top, the VIN's
  // length and the colour swatch. The fields themselves stay uncontrolled:
  // scans and lookups write into them directly, then call readDrafts.
  const [mileageDraft, setMileageDraft] = useState(vehicle ? String(vehicle.mileage) : '')
  // The mileage in the summary can be changed where it is read, without
  // going down to the field: a reading is the one thing changed every visit.
  const [editingMileage, setEditingMileage] = useState(false)
  const mileageBeforeEdit = useRef('')
  const [inspectionDraft, setInspectionDraft] = useState(openedInspectionDue)
  const [vinDraft, setVinDraft] = useState(vehicle?.vin ?? '')
  const [colorDraft, setColorDraft] = useState(vehicle?.color ?? '')
  // Mileage is not read back here: both places that edit it set it directly,
  // and reading the field during an edit in the header would undo the edit.
  const readDrafts = () => {
    setInspectionDraft(fieldValue('inspectionDueAt'))
    setVinDraft(fieldValue('vin'))
    setColorDraft(fieldValue('color'))
  }
  /** Back to what the vehicle has saved, for a form opened again or on another vehicle. */
  const resetDrafts = () => {
    setEditingMileage(false)
    setMileageDraft(vehicle ? String(vehicle.mileage) : '')
    setInspectionDraft(openedInspectionDue)
    setVinDraft(vehicle?.vin ?? '')
    setColorDraft(vehicle?.color ?? '')
  }

  // Sync state when vehicle prop changes (e.g. opening edit for a different vehicle)
  useEffect(() => {
    setSelectedCustomerId(vehicle?.customerId || defaultCustomerId || 'none')
    setSelectedCustomer(
      vehicle?.customer ??
        (!vehicle && defaultCustomer?.id === defaultCustomerId ? defaultCustomer : null) ??
        null
    )
    setPreview(vehicle?.imageUrl ?? null)
    setImageFile(null)
    resetDrafts()
    setFuelType(vehicle?.fuelType ?? 'gasoline')
    setTransmission(vehicle?.transmission ?? (isMarine ? 'outboard' : 'automatic'))
    setLookupNote(null)
    setScannedOwner(null)
    setOwnerMatches([])
    setAddOwner(true)
    dropOwnerLookup()
    // resetDrafts reads the same vehicle fields listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    vehicle?.id,
    vehicle?.customerId,
    vehicle?.fuelType,
    vehicle?.transmission,
    isMarine,
    defaultCustomerId,
    defaultCustomer?.id,
    vehicle?.customer?.id,
  ])

  // A new photo saved from elsewhere (the phone, while this form is open) is
  // shown without throwing away anything typed here; a photo picked in this
  // form and not yet saved wins.
  useEffect(() => {
    if (!imageFile) setPreview(vehicle?.imageUrl ?? null)
    // Only the saved photo moving should move the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.imageUrl])

  // A customer preselected by id alone (a link with ?customerId=) still needs a name
  useEffect(() => {
    if (!open || selectedCustomerId === 'none' || selectedCustomer?.id === selectedCustomerId)
      return
    let cancelled = false
    getCustomerOption(selectedCustomerId).then((result) => {
      if (cancelled || !result.success || !result.data) return
      setSelectedCustomer(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [open, selectedCustomerId, selectedCustomer?.id])

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

  /** Uploads the photo picked in this form and answers its address. */
  const uploadImage = async (file: File): Promise<string> => {
    const toastId = toast.loading(t('uploadingImage'))
    const compressed = await compressImage(file)
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
    setIfEmpty('hsn', data.hsn)
    setIfEmpty('tsn', data.tsn)
    readDrafts()

    // A select has no empty state, so only fill it while it still holds the
    // value the form opened with.
    if (data.fuelType && fuelType === (vehicle?.fuelType ?? 'gasoline')) {
      setFuelType(data.fuelType)
    }

    if (!data.owner?.name || selectedCustomerId !== 'none') return
    setScannedOwner(data.owner)
    setAddOwner(true)

    // Near-identical names are still a judgement call: two brothers at one
    // address differ by a first name. Offer the close ones and let the user say.
    const ownerName = data.owner.name
    const lookup = ++ownerLookupRef.current
    setOwnerLookupPending(true)
    setOwnerMatches([])
    void findOwnerCandidates(ownerName)
      .then((result) => {
        if (lookup !== ownerLookupRef.current) return
        const candidates = (result.success && result.data ? result.data : [])
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
      })
      .finally(() => {
        if (lookup === ownerLookupRef.current) setOwnerLookupPending(false)
      })
  }

  /**
   * A registry answer fills the same fields as a scanned document, plus the
   * gearbox and engine code, which papers rarely state. The select only moves while it still
   * holds the value the form opened with.
   */
  const applyLookup = (data: VehicleLookup, asked: { by: 'plate' | 'vin'; value: string }) => {
    applyScan(data)
    const engineCode = formRef.current?.elements.namedItem('engineCode') as HTMLInputElement | null
    if (data.engineCode && engineCode && !engineCode.value) engineCode.value = data.engineCode
    if (data.inspectionDue) {
      const input = formRef.current?.elements.namedItem(
        'inspectionDueAt'
      ) as HTMLInputElement | null
      // The registry's fresh date replaces an empty field, the date the form
      // opened with, or the date an earlier lookup wrote; a date the user
      // typed since stays.
      const earlier = lookupRef.current?.result.inspectionDue?.slice(0, 10)
      if (
        input &&
        (!input.value || input.value === openedInspectionDue || input.value === earlier)
      ) {
        input.value = data.inspectionDue.slice(0, 10)
      }
    }
    lookupRef.current = {
      connectorId: data.connectorId,
      by: asked.by,
      value: asked.value,
      result: data,
    }
    if (data.transmission && transmission === defaultTransmission) {
      setTransmission(data.transmission)
    }
    setLookupNote(data)
    readDrafts()
  }

  // The fields are uncontrolled, so the registry's answer is written once the
  // form has rendered, the same way the lookup button writes it.
  const appliedLookupRef = useRef<VehicleLookup | null>(null)
  useEffect(() => {
    if (!open || vehicle || !initialLookup) return
    if (appliedLookupRef.current === initialLookup) return
    appliedLookupRef.current = initialLookup
    const frame = requestAnimationFrame(() =>
      applyLookup(initialLookup, { by: 'plate', value: initialLookup.licensePlate ?? '' })
    )
    return () => cancelAnimationFrame(frame)
    // applyLookup reads the current form and selects; running it again on
    // their change would overwrite what the user has since typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicle, initialLookup])
  useEffect(() => {
    if (!open) {
      appliedLookupRef.current = null
      lookupRef.current = null
      dropOwnerLookup()
      // Closed without saving: opened again, it shows what is saved, not
      // what was picked last time.
      resetDrafts()
      setFuelType(vehicle?.fuelType ?? 'gasoline')
      setTransmission(defaultTransmission)
      setLookupNote(null)
      setImageFile(null)
      setPreview(vehicle?.imageUrl ?? null)
    }
    // Only closing matters here; the values are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // The save shortcut and Enter reach here past the disabled button
    if (ownerLookupPending) return
    const formData = new FormData(e.currentTarget)

    // Caught here rather than by the server, which could only answer in English.
    if (showTypeKey) {
      const hsn = normalizeHsn(String(formData.get('hsn') ?? ''))
      const tsn = normalizeTsn(String(formData.get('tsn') ?? ''))
      if (hsn && !HSN_PATTERN.test(hsn)) {
        toast.error(t('hsnInvalid'))
        return
      }
      if (tsn && !TSN_PATTERN.test(tsn)) {
        toast.error(t('tsnInvalid'))
        return
      }
    }

    setLoading(true)

    try {
      // The photo is sent only when it was changed here: a new one picked, or
      // the saved one removed. Sending back the address the form opened with
      // would undo a photo taken on a phone meanwhile, which has already
      // replaced it (and let the old file go) on the server.
      let imageUrl: string | undefined
      try {
        if (imageFile) imageUrl = await uploadImage(imageFile)
        else if (!preview && vehicle?.imageUrl) imageUrl = ''
      } catch (err) {
        modal.open(
          'error',
          'Upload Failed',
          err instanceof Error ? err.message : 'Could not upload image'
        )
        setLoading(false)
        return
      }

      // The keeper read off the papers is nobody until a customer row exists,
      // and losing them to an unnoticed checkbox is worse than an extra record.
      // '' when editing tells the update action to drop the owner.
      let customerId = clearableInput(
        selectedCustomerId === 'none' ? '' : selectedCustomerId,
        Boolean(vehicle)
      )
      if (!customerId && addOwner && scannedOwner?.name) {
        const created = await createCustomer({
          name: scannedOwner.name,
          address: scannedOwner.address,
        })
        if (created.success && created.data) {
          customerId = (created.data as { id: string }).id
        } else if (!handleGated(created)) {
          toast.error(created.error || t('ownerSaveFailed'))
        }
      }

      // An emptied field has to reach the server as '' when editing, which
      // the update action turns into null; undefined there means "not
      // touched" and would bring the old value back. On create, leaving an
      // empty field out is the same thing as clearing it.
      const optional = (name: string) => clearableInput(formData.get(name), Boolean(vehicle))
      const inspectionDue = (formData.get('inspectionDueAt') as string | null) ?? ''
      const withUnit = <T,>(value: T) =>
        typeof value === 'string' && !isMarine
          ? engineSizeToSave(value, vehicle?.engineSize)
          : value
      const data: CreateVehicleInput & { imageUrl?: string } = {
        make: formData.get('make') as string,
        model: formData.get('model') as string,
        year: Number(formData.get('year')),
        vin: optional('vin'),
        licensePlate: optional('licensePlate'),
        color: optional('color'),
        mileage: Number(formData.get('mileage')) || 0,
        fuelType: fuelType || undefined,
        transmission: transmission || undefined,
        // A bare number is saved with its unit, so "649" is kept as "649 cc".
        engineSize: withUnit(optional('engineSize')),
        engineCode: optional('engineCode'),
        hsn: showTypeKey ? optional('hsn') : undefined,
        tsn: showTypeKey ? optional('tsn') : undefined,
        // An empty string clears a hand-typed date; undefined leaves the stored
        // date alone, so saving another field, or a lookup that brought no
        // date, does not turn a registry's date into one typed by hand.
        inspectionDueAt:
          isMarine || inspectionDue === openedInspectionDue ? undefined : inspectionDue,
        registryLookup: isMarine ? undefined : (lookupRef.current ?? undefined),
        customerId,
      }

      const payload = imageUrl !== undefined ? { ...data, imageUrl } : data

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

  // A label for a stored value: the words for the ones this form offers, the
  // value itself for anything a registry or an import wrote.
  const optionLabel = (value: string) => {
    const key = value === 'two-stroke' ? 'twoStroke' : value
    return t.has(key) ? t(key) : value
  }
  const fuelOptions = withCurrent(
    isMarine
      ? ['gasoline', 'diesel', 'two-stroke', 'other']
      : ['gasoline', 'diesel', 'electric', 'hybrid', 'other'],
    fuelType
  )
  const transmissionOptions = withCurrent(
    isMarine ? ['outboard', 'inboard'] : ['automatic', 'manual', 'cvt'],
    transmission
  )

  // "2016 · Diesel · Automatic": the saved vehicle, under its name, when editing
  const vehicleSummary = vehicle
    ? [
        vehicle.year ? String(vehicle.year) : null,
        vehicle.fuelType ? optionLabel(vehicle.fuelType) : null,
        vehicle.transmission ? optionLabel(vehicle.transmission) : null,
        isMarine ? vehicle.licensePlate : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  const mileageLabel = isMarine ? t('mileageMarine') : t('mileage')
  const unit = distanceUnit
  const mileageShown = mileageDraft.trim() === '' ? null : Number(mileageDraft)
  const inspectionShown = inspectionDraft
    ? {
        // A date key, read at noon UTC so it names the same day everywhere.
        text: format.dateTime(new Date(`${inspectionDraft}T12:00:00Z`), {
          dateStyle: 'medium',
          timeZone: 'UTC',
        }),
        tone: inspectionTone(inspectionDraft),
      }
    : null
  // Only beside a date: "Not set" from the registry says nothing useful.
  const fromRegistry =
    !!inspectionDraft &&
    !!vehicle?.inspectionStatus?.source &&
    vehicle.inspectionStatus.source !== 'manual' &&
    inspectionDraft === openedInspectionDue
  const vinLength = vinDraft.trim().length
  const swatch = cssColor(colorDraft)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[90vh] sm:max-w-5xl"
          // Escape in the mileage being changed puts the reading back; it must
          // not throw the whole form away with it.
          onEscapeKeyDown={(e) => {
            if (editingMileage) e.preventDefault()
          }}
        >
          <DialogHeader>
            {/* The plate and the name say which vehicle is open before any
                field does; the docs link sits on the same line, clear of the
                close button. */}
            <div className="flex items-start gap-3 pr-8">
              {vehicle?.licensePlate && !isMarine && (
                <PlateChip plate={vehicle.licensePlate} size="md" className="mt-0.5" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <DialogTitle className="truncate leading-tight">
                  {vehicle ? (
                    <>
                      <span className="sr-only">{t('editTitle')}: </span>
                      {`${vehicle.make} ${vehicle.model}`.trim()}
                    </>
                  ) : (
                    t('addTitle')
                  )}
                </DialogTitle>
                <DialogDescription className={vehicleSummary ? 'text-[13px]' : 'sr-only'}>
                  {vehicleSummary || (vehicle ? t('editTitle') : t('addTitle'))}
                </DialogDescription>
              </div>
              <DocsLink href="/docs/features/vehicles" variant="hint" className="mt-1 shrink-0" />
            </div>
          </DialogHeader>

          <form
            ref={formRef}
            onSubmit={handleSubmit}
            onInput={readDrafts}
            className="flex min-h-0 flex-1 flex-col"
          >
            <DialogBody className="space-y-4">
              {/* At a glance: the photo, who owns it, how far it has gone and
                  when it is next due, and the papers that can fill the rest. */}
              <section className="grid gap-4 rounded-xl border bg-card p-3 sm:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)_15rem]">
                <div className="w-full max-w-[12rem] space-y-1.5 sm:max-w-none">
                  <div className="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted/40">
                    {preview ? (
                      <Image
                        src={preview}
                        alt={t('photo')}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                        <Camera className="h-6 w-6" aria-hidden />
                        <span className="text-xs font-medium">{tDetail('addPhoto')}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      aria-label={preview ? tDetail('changePhoto') : tDetail('addPhoto')}
                      title={t('imageFormats')}
                      className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {preview && (
                      <>
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 text-[11.5px] font-medium text-white"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          {tDetail('changePhoto')}
                        </span>
                        <button
                          type="button"
                          onClick={clearImage}
                          aria-label={t('removePhoto')}
                          className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  {/* A vehicle already saved can take its photo from a phone,
                      as a work order can. */}
                  {vehicle && (
                    <PhotoHandoffButton
                      vehicleId={vehicle.id}
                      variant="link"
                      onVehiclePhoto={(url) => {
                        setImageFile(null)
                        setPreview(url)
                      }}
                    />
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={handleImageSelect}
                    className="hidden"
                    aria-label={t('photo')}
                    tabIndex={-1}
                  />
                </div>

                <div className="min-w-0 space-y-4 self-center">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                      {tDetail('owner')}
                    </Label>
                    <CustomerCombobox
                      showAvatar
                      value={selectedCustomerId === 'none' ? '' : selectedCustomerId}
                      initialCustomer={selectedCustomer}
                      // A customer given by id alone is named once the lookup below answers
                      placeholder={
                        selectedCustomerId !== 'none' && !selectedCustomer ? '…' : t('noCustomer')
                      }
                      searchPlaceholder={t('searchCustomers')}
                      noneLabel={t('noCustomer')}
                      emptyLabel={t('noCustomerFound')}
                      onChange={(id, customer) => {
                        setSelectedCustomerId(id || 'none')
                        setSelectedCustomer(customer)
                      }}
                      footer={(close) => (
                        <div className="border-t p-1">
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                            onClick={() => {
                              close()
                              setShowCustomerForm(true)
                            }}
                          >
                            <Plus className="h-4 w-4" />
                            {t('addCustomer')}
                          </button>
                        </div>
                      )}
                    />
                  </div>

                  <dl className="flex flex-wrap gap-x-10 gap-y-3">
                    <div className="space-y-1">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                        {mileageLabel}
                      </dt>
                      <dd className="flex h-8 items-center">
                        {editingMileage ? (
                          <div className="relative w-40">
                            <Input
                              // Opened by a click on the figure, to type in straight away.
                              autoFocus
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={mileageDraft}
                              aria-label={mileageLabel}
                              onChange={(e) => setMileageDraft(e.target.value)}
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={() => setEditingMileage(false)}
                              onKeyDown={(e) => {
                                // Enter keeps the reading and stays in the form
                                // rather than saving it; Escape puts it back.
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  setEditingMileage(false)
                                } else if (e.key === 'Escape') {
                                  e.preventDefault()
                                  setMileageDraft(mileageBeforeEdit.current)
                                  setEditingMileage(false)
                                }
                              }}
                              className={cn(
                                'h-8 font-display text-lg font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                                unit && 'pr-10'
                              )}
                            />
                            {unit && (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm font-medium text-muted-foreground"
                              >
                                {unit}
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              mileageBeforeEdit.current = mileageDraft
                              setEditingMileage(true)
                            }}
                            title={isMarine ? t('editMileageMarine') : t('editMileage')}
                            aria-label={`${isMarine ? t('editMileageMarine') : t('editMileage')}: ${
                              mileageShown === null || Number.isNaN(mileageShown)
                                ? '–'
                                : `${format.number(mileageShown)}${unit ? ` ${unit}` : ''}`
                            }`}
                            className="group/mileage -mx-1.5 inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 font-display text-xl font-semibold tabular-nums transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {mileageShown === null || Number.isNaN(mileageShown) ? (
                              <span className="text-muted-foreground">–</span>
                            ) : (
                              <span>
                                {format.number(mileageShown)}
                                {unit && (
                                  <span className="ml-1 text-sm font-medium text-muted-foreground">
                                    {unit}
                                  </span>
                                )}
                              </span>
                            )}
                            <Pencil
                              aria-hidden
                              className="h-3.5 w-3.5 text-muted-foreground opacity-50 transition-opacity group-hover/mileage:opacity-100 group-focus-visible/mileage:opacity-100"
                            />
                          </button>
                        )}
                      </dd>
                    </div>
                    {!isMarine && (
                      <div className="space-y-1">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                          {t('inspectionDue')}
                        </dt>
                        <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {inspectionShown ? (
                            <span className="inline-flex items-center rounded-full border bg-background px-2.5 py-0.5">
                              <StatusLamp tone={inspectionShown.tone} className="text-[13px]">
                                {inspectionShown.text}
                              </StatusLamp>
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-dashed px-2.5 py-0.5 text-[13px] text-muted-foreground">
                              {t('notSet')}
                            </span>
                          )}
                          {fromRegistry && (
                            <span className="text-xs text-muted-foreground">
                              {t('fromRegistry')}
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div className="border-t pt-3 sm:col-span-2 lg:col-span-1 lg:self-center lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
                  <ScanDocumentButton onScanned={applyScan} stacked />
                </div>

                {/* Keeper read off the papers who matches no customer yet */}
                {scannedOwner?.name && selectedCustomerId === 'none' && (
                  <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 sm:col-span-2 lg:col-span-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={addOwner}
                        onCheckedChange={(next) => setAddOwner(next === true)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm">
                          {t('addScannedOwner', { name: scannedOwner.name })}
                        </span>
                        {scannedOwner.address && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {scannedOwner.address}
                          </span>
                        )}
                      </span>
                    </label>

                    {ownerMatches.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => setShowOwnerMatch(true)}
                      >
                        {t('ownerMatchChoose')}
                      </Button>
                    )}
                  </div>
                )}
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <FormCard title={t('sectionIdentification')}>
                  <div className="space-y-2">
                    <Label htmlFor="licensePlate">
                      {isMarine ? t('licensePlateMarine') : t('licensePlate')}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="licensePlate"
                        name="licensePlate"
                        placeholder="ABC-1234"
                        defaultValue={vehicle?.licensePlate ?? ''}
                        className="flex-1"
                      />
                      {!isMarine && (
                        <VehicleLookupButton
                          by="plate"
                          text={t('lookupShort')}
                          getValue={() => fieldValue('licensePlate')}
                          onFound={(data, asked) =>
                            applyLookup(data, { by: 'plate', value: asked })
                          }
                          vehicleId={vehicle?.id}
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <Label htmlFor="vin">{isMarine ? t('vinMarine') : t('vin')}</Label>
                      {/* A VIN is seventeen characters; counting them catches the
                          one missed or typed twice before a lookup is wasted. */}
                      {!isMarine && vinLength > 0 && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 font-mono text-[11px] tabular-nums',
                            vinLength === VIN_LENGTH
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-muted-foreground'
                          )}
                          title={t('vinLength', { count: vinLength, total: VIN_LENGTH })}
                        >
                          <span aria-hidden>
                            {vinLength} / {VIN_LENGTH}
                          </span>
                          <span className="sr-only">
                            {t('vinLength', { count: vinLength, total: VIN_LENGTH })}
                          </span>
                          {vinLength === VIN_LENGTH && <Check className="h-3 w-3" aria-hidden />}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="vin"
                        name="vin"
                        placeholder="1HGCM82633A004352"
                        defaultValue={vehicle?.vin ?? ''}
                        autoComplete="off"
                        spellCheck={false}
                        className="flex-1 font-mono"
                      />
                      {!isMarine && (
                        <VehicleLookupButton
                          by="vin"
                          text={t('decodeShort')}
                          getValue={() => fieldValue('vin')}
                          onFound={(data, asked) => applyLookup(data, { by: 'vin', value: asked })}
                          vehicleId={vehicle?.id}
                        />
                      )}
                    </div>
                  </div>

                  {/* Under both fields, since either button may have answered */}
                  {lookupNote && (
                    <p className="-mt-2 text-xs text-muted-foreground">
                      {lookupNote.inspectionDue
                        ? t('lookupInspectionDue', {
                            source: lookupNote.source,
                            date: format.dateTime(new Date(lookupNote.inspectionDue), {
                              dateStyle: 'medium',
                            }),
                          })
                        : t('lookupSource', { source: lookupNote.source })}
                    </p>
                  )}

                  {showTypeKey && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="hsn">{t('hsn')}</Label>
                          <Input
                            id="hsn"
                            name="hsn"
                            placeholder="0603"
                            inputMode="numeric"
                            maxLength={6}
                            autoComplete="off"
                            className="font-mono"
                            defaultValue={vehicle?.hsn ?? ''}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="tsn">{t('tsn')}</Label>
                          <Input
                            id="tsn"
                            name="tsn"
                            placeholder="BFQ"
                            maxLength={12}
                            autoComplete="off"
                            className="font-mono uppercase"
                            defaultValue={vehicle?.tsn ?? ''}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{t('typeKeyHint')}</p>
                    </div>
                  )}

                  {!isMarine && (
                    <div className="space-y-2">
                      <Label htmlFor="inspectionDueAt">{t('inspectionDue')}</Label>
                      <Input
                        id="inspectionDueAt"
                        name="inspectionDueAt"
                        type="date"
                        defaultValue={openedInspectionDue}
                        className="w-full sm:w-48"
                      />
                      <p className="text-xs text-muted-foreground">
                        {vehicle?.inspectionStatus?.source &&
                        vehicle.inspectionStatus.source !== 'manual'
                          ? t('inspectionDueFromRegistry')
                          : t('inspectionDueHint')}
                      </p>
                    </div>
                  )}
                </FormCard>

                <FormCard title={isMarine ? t('sectionVehicleMarine') : t('sectionVehicle')}>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem]">
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
                    <div className="col-span-2 space-y-2 sm:col-span-1">
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
                  </div>

                  <Segmented
                    id="fuelType"
                    label={t('fuelType')}
                    value={fuelType}
                    onChange={setFuelType}
                    options={fuelOptions.map((value) => ({ value, label: optionLabel(value) }))}
                  />
                  <Segmented
                    id="transmission"
                    label={isMarine ? t('transmissionMarine') : t('transmission')}
                    value={transmission}
                    onChange={setTransmission}
                    options={transmissionOptions.map((value) => ({
                      value,
                      label: optionLabel(value),
                    }))}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="engineSize">
                        {isMarine ? t('engineSizeMarine') : t('engineSize')}
                      </Label>
                      {isMarine ? (
                        <Input
                          id="engineSize"
                          name="engineSize"
                          placeholder="Mercury F 350 XXL Verado V-10 (350 hp)"
                          defaultValue={vehicle?.engineSize ?? ''}
                        />
                      ) : (
                        <EngineSizeInput
                          key={vehicle?.id ?? 'new'}
                          defaultValue={vehicle?.engineSize ?? ''}
                        />
                      )}
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="color">{t('color')}</Label>
                      <div className="relative">
                        {/* The colour itself where the name is one a browser
                            knows, an empty ring where it is not. */}
                        <span
                          aria-hidden
                          className={cn(
                            'pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 rounded-full border',
                            swatch
                              ? 'border-foreground/20'
                              : 'border-dashed border-muted-foreground/50'
                          )}
                          style={swatch ? { background: swatch } : undefined}
                        />
                        <Input
                          id="color"
                          name="color"
                          placeholder="Silver"
                          defaultValue={vehicle?.color ?? ''}
                          className="pl-8"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mileage">{mileageLabel}</Label>
                      <div className="relative">
                        <Input
                          id="mileage"
                          name="mileage"
                          type="number"
                          placeholder="0"
                          value={mileageDraft}
                          onChange={(e) => setMileageDraft(e.target.value)}
                          // No spinner: it would sit on top of the unit, and
                          // nobody steps an odometer reading one at a time.
                          className={cn(
                            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                            unit && 'pr-10'
                          )}
                        />
                        {unit && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
                          >
                            {unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </FormCard>
              </div>
            </DialogBody>

            <DialogFooter className="sm:items-center">
              {vehicle && onDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                  onClick={onDelete}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {isMarine ? t('deleteVehicleMarine') : t('deleteVehicle')}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tc('cancel')}
              </Button>
              <Button data-save-shortcut type="submit" disabled={loading || ownerLookupPending}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {vehicle ? tc('saveChanges') : t('addTitle')}
              </Button>
            </DialogFooter>
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
                  setSelectedCustomer(customer)
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
          setSelectedCustomer(created)
          setSelectedCustomerId(created.id)
          setScannedOwner(null)
        }}
      />
    </>
  )
}

/**
 * The engine size field. Its placeholder is in the workshop's unit, and a
 * bare number shows the unit it will be saved with, read from its size: 1.6
 * is litres and 649 is cubic centimetres.
 */
function EngineSizeInput({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations('vehicles.form')
  const unit = useEngineSizeUnit()
  const hintId = useId()
  const [draft, setDraft] = useState(defaultValue)
  const suffix = engineSizeHint(draft, defaultValue)
  return (
    <div className="relative">
      <Input
        id="engineSize"
        name="engineSize"
        placeholder={engineSizePlaceholder(unit)}
        defaultValue={defaultValue}
        onInput={(e) => setDraft(e.currentTarget.value)}
        aria-describedby={hintId}
        className={suffix ? 'pr-10' : undefined}
      />
      {suffix && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
        >
          {suffix}
        </span>
      )}
      {/* Always mounted, so a screen reader hears the unit as it changes. */}
      <span id={hintId} className="sr-only" aria-live="polite">
        {suffix ? t('engineSizeSavedAs', { unit: suffix }) : ''}
      </span>
    </div>
  )
}

const VIN_LENGTH = 17

/** The options, and the stored value too when it is none of them, so it still shows as chosen. */
function withCurrent(options: string[], current: string): string[] {
  return !current || options.includes(current) ? options : [...options, current]
}

/** How soon a periodic inspection is due, as the vehicle page colours it. */
function inspectionTone(dateKey: string): LampTone {
  const left = new Date(`${dateKey}T23:59:59`).getTime() - Date.now()
  if (left < 0) return 'red'
  if (left < 30 * 86_400_000) return 'amber'
  return 'green'
}

/** The colour a name stands for, when it is one the browser knows ("silver", "#c0c0c0"). */
function cssColor(name: string): string | null {
  const value = name.trim().toLowerCase()
  if (!value || typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return null
  return CSS.supports('color', value) ? value : null
}

/** A titled card holding one group of the form's fields. */
function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <h3 className="border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  )
}

/**
 * A short list of choices as one row of buttons, every option in sight
 * rather than behind a dropdown. Arrow keys move the choice, as in any radio
 * group.
 */
function Segmented({
  id,
  label,
  value,
  options,
  onChange,
}: {
  /** The field's name, as the dropdown it replaced had, so its label still names it. */
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const labelId = useId()
  const groupRef = useRef<HTMLDivElement>(null)
  const move = (step: number) => {
    const at = options.findIndex((o) => o.value === value)
    const next = options[(at + step + options.length) % options.length]
    onChange(next.value)
    // Focus follows the choice, so the next arrow press moves on from it.
    requestAnimationFrame(() =>
      groupRef.current
        ?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)
        ?.focus()
    )
  }
  return (
    <div className="space-y-2">
      <Label id={labelId} htmlFor={id}>
        {label}
      </Label>
      <div
        ref={groupRef}
        id={id}
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex w-full rounded-lg border bg-muted/50 p-0.5"
      >
        {options.map((option) => {
          const checked = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              data-value={option.value}
              tabIndex={checked || (!value && option === options[0]) ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  move(1)
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  move(-1)
                }
              }}
              className={cn(
                'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                checked
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
