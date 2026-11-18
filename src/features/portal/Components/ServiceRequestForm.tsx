'use client'

import { Camera, Check, ImagePlus, Play, RotateCw, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react'
import { type DayHours, weekdayOf } from '@/features/workshop-calendar/Lib/calendar'
import { formatDay } from '@/features/workshop-calendar/Lib/format'
import { createServiceRequest } from '../Actions/portalActions'
import {
  megabytes,
  PORTAL_PHOTO_MAX_BYTES,
  PORTAL_REQUEST_MAX_FILES,
  PORTAL_UPLOAD_ACCEPT,
  PORTAL_VIDEO_MAX_BYTES,
  portalUploadKind,
  portalUploadProblem,
  type PortalUploadKind,
} from '../Lib/portalUploads'
import {
  PortalUploadError,
  releasePortalUploads,
  uploadPortalFile,
} from '../Lib/portalUploadClient'
import {
  PortalButton,
  PortalField,
  PortalInput,
  PortalLinkButton,
  PortalNotice,
  PortalPanel,
  PortalTextarea,
} from './Ui'

export type BookVehicle = {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  /** The car is with the workshop right now. */
  inWorkshop?: boolean
}

/** Sentinel for "another car": never collides with a cuid. */
const NEW_VEHICLE = '__new__'

/** The oldest year a vehicle can be entered with; the server accepts the same. */
const MIN_YEAR = 1900

/** As much as the server takes; the field stops there. */
const MAX_DESCRIPTION = 4000

/**
 * The quick choices for what is needed. The app has no list of what a
 * workshop offers, so this is a short fixed set of what every workshop is
 * asked for, and the description field carries everything else. A boat yard
 * is not asked about tyres and brakes.
 */
const TOPICS = ['service', 'inspection', 'tires', 'brakes', 'problem'] as const
const MARINE_TOPICS = ['service', 'inspection', 'problem'] as const
type Topic = (typeof TOPICS)[number]

type PreferredTime = 'morning' | 'afternoon'

type Field = 'vehicle' | 'make' | 'model' | 'year' | 'description' | 'date' | 'files' | 'form'
type Problem = { key: string; values?: Record<string, string | number> }

/** What the customer typed, checked before anything is sent. */
export function checkServiceRequest(
  input: {
    vehicleId: string
    make: string
    model: string
    year: string
    description: string
    /** A quick choice says enough on its own: the description may then be empty. */
    topic?: string | null
    preferredDate: string
  },
  options: {
    today: string
    closedDays: { date: string; name: string }[]
    /** Weekdays the workshop never opens, Sunday = 0. */
    closedWeekdays?: number[]
  }
): Partial<Record<Field, Problem>> {
  const errors: Partial<Record<Field, Problem>> = {}
  const isNewVehicle = input.vehicleId === NEW_VEHICLE
  if (!input.vehicleId) errors.vehicle = { key: 'selectVehicle' }
  if (isNewVehicle) {
    if (!input.make.trim()) errors.make = { key: 'fillMake' }
    if (!input.model.trim()) errors.model = { key: 'fillModel' }
    const maxYear = Number(options.today.slice(0, 4)) + 1
    if (input.year.trim()) {
      const year = Number(input.year)
      if (!Number.isInteger(year) || year < MIN_YEAR || year > maxYear) {
        errors.year = { key: 'invalidYear', values: { min: MIN_YEAR, max: maxYear } }
      }
    }
  }
  if (!input.description.trim() && !input.topic) errors.description = { key: 'describeIssue' }
  if (input.preferredDate) {
    const closed = options.closedDays.find((d) => d.date === input.preferredDate)
    if (input.preferredDate < options.today) errors.date = { key: 'pastDate' }
    else if (closed) errors.date = { key: 'closedDay', values: { name: closed.name } }
    else if (options.closedWeekdays?.includes(weekdayOf(input.preferredDate))) {
      errors.date = { key: 'closedWeekday' }
    }
  }
  return errors
}

/**
 * Which parts of a day the workshop is open: the morning when it opens before
 * noon, the afternoon when it is still open after it. Both for a day whose
 * hours are not known.
 */
export function openDayParts(hours: DayHours | undefined): PreferredTime[] {
  if (!hours?.open) return ['morning', 'afternoon']
  const parts: PreferredTime[] = []
  if (hours.start < '12:00') parts.push('morning')
  if (hours.end > '12:00') parts.push('afternoon')
  return parts
}

/** One photo or video in the form: on its way, arrived, or refused. */
interface Upload {
  id: string
  file: File
  kind: PortalUploadKind
  /** A local address for the thumbnail; the stored file is the workshop's to open. */
  preview: string
  status: 'uploading' | 'done' | 'failed'
  /** 0 to 1 while it is on its way. */
  progress: number
  /** The stored url, once the server has the file. */
  url?: string
  /** Why it failed, as a message key. */
  problem?: string
}

/**
 * Tells the files in a form apart. A counter and not `crypto.randomUUID`,
 * which a browser only offers on https: a self-hosted portal on a plain
 * address would break at the first photo.
 */
let uploadSerial = 0

/** The route's refusal, as the sentence the customer reads. */
const uploadProblemKey = (code: string) =>
  ({
    type: 'fileType',
    empty: 'fileEmpty',
    tooLarge: 'fileTooLarge',
    tooMany: 'fileTooMany',
    signedOut: 'fileSignedOut',
    network: 'fileNetwork',
  })[code] ?? 'fileFailed'

/**
 * Book a visit: which car, what it needs, the customer's own words, photos
 * and a short video, and the day that suits.
 *
 * A file starts uploading the moment it is added, each with its own progress,
 * so sending the request is instant and a failed photo is seen before
 * anything is sent. Files the customer takes out again, and files still in
 * the form when they leave the page, are handed back to the server to
 * delete: only what was sent is kept.
 *
 * Problems are said at the field they are about. After sending, the form
 * gives way to what happens next, with the way to Messages and home.
 */
export function ServiceRequestForm({
  orgId,
  workshopName,
  vehicles,
  today,
  closedDays = [],
  closedWeekdays = [],
  week,
  marine = false,
  messagesEnabled = true,
  initialVehicleId,
}: {
  /** The slug or id in the address: where uploads go and links lead. */
  orgId: string
  workshopName: string
  vehicles: BookVehicle[]
  /** The workshop's today, "YYYY-MM-DD": the first day that can be picked. */
  today: string
  /** Holidays and closures in the coming weeks, so they can be avoided. */
  closedDays?: { date: string; name: string }[]
  /** Weekdays the workshop never opens, Sunday = 0, refused before sending. */
  closedWeekdays?: number[]
  /** The workshop's week, Sunday first: which part of a day can be asked for. */
  week?: DayHours[]
  /** A boat yard: boats, and no tyres or brakes among the quick choices. */
  marine?: boolean
  /** The chat is on: the sent state links to Messages. */
  messagesEnabled?: boolean
  /** The car the customer came from, already chosen. */
  initialVehicleId?: string
}) {
  const t = useTranslations('portal.book')
  const tc = useTranslations('workshopCalendar.portal')
  const locale = useLocale()
  const router = useRouter()
  const formId = useId()
  const [isPending, startTransition] = useTransition()

  // A customer with no cars on file starts straight in "another car".
  const firstVehicle = () =>
    vehicles.length === 0
      ? NEW_VEHICLE
      : vehicles.some((v) => v.id === initialVehicleId)
        ? (initialVehicleId as string)
        : vehicles.length === 1
          ? vehicles[0].id
          : ''
  const [vehicleId, setVehicleId] = useState(firstVehicle)
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [plate, setPlate] = useState('')
  const [topic, setTopic] = useState<Topic | null>(null)
  const [description, setDescription] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [preferredTime, setPreferredTime] = useState<PreferredTime | null>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Field, Problem>>>({})
  const [sent, setSent] = useState(false)

  const pickerRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  /** The uploads as they are now, for the moment the page goes away. */
  const uploadsRef = useRef<Upload[]>([])
  uploadsRef.current = uploads
  /** One way to stop each upload that is still on its way. */
  const aborts = useRef(new Map<string, AbortController>())

  const isNewVehicle = vehicleId === NEW_VEHICLE
  const maxYear = Number(today.slice(0, 4)) + 1
  const topics: readonly Topic[] = marine ? MARINE_TOPICS : TOPICS
  const dayParts = preferredDate ? openDayParts(week?.[weekdayOf(preferredDate)]) : []
  const uploading = uploads.some((u) => u.status === 'uploading')
  const room = PORTAL_REQUEST_MAX_FILES - uploads.length

  // Leaving with files still in the form: they were never sent, so the
  // server lets them go. Sent files are out of the list by then.
  useEffect(() => {
    const leave = () => {
      for (const controller of aborts.current.values()) controller.abort()
      const unsent = uploadsRef.current.flatMap((u) => (u.url ? [u.url] : []))
      releasePortalUploads(orgId, unsent, { leaving: true })
    }
    // A page brought back from the browser's back-forward cache still shows
    // the files it let go on the way out: they are gone, so the list is too.
    const back = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      for (const upload of uploadsRef.current) URL.revokeObjectURL(upload.preview)
      setUploads([])
    }
    window.addEventListener('pagehide', leave)
    window.addEventListener('pageshow', back)
    return () => {
      window.removeEventListener('pagehide', leave)
      window.removeEventListener('pageshow', back)
      leave()
      for (const upload of uploadsRef.current) URL.revokeObjectURL(upload.preview)
    }
  }, [orgId])

  const message = (field: Field) => {
    const error = errors[field]
    if (!error) return null
    // A closed day is worded by the calendar, like the server's refusal.
    if (error.key === 'closedDay') return tc('closedDay', error.values as { name: string })
    if (error.key === 'closedWeekday') return tc('closedWeekday')
    return t(error.key, error.values)
  }
  const describedBy = (field: Field) =>
    errors[field] ? { invalid: true, 'aria-describedby': `${formId}-${field}-error` } : {}
  /** The message under a field, tied to it for screen readers. */
  const fieldError = (field: Field) => {
    const text = message(field)
    return text ? (
      <p id={`${formId}-${field}-error`} role="alert" className="p-field__error">
        {text}
      </p>
    ) : null
  }
  const clear = (field: Field) =>
    setErrors((prev) => {
      if (!prev[field] && !prev.form) return prev
      const { [field]: _gone, form: _form, ...rest } = prev
      return rest
    })

  const patch = (id: string, change: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...change } : u)))

  const start = useCallback(
    (upload: Upload) => {
      const controller = new AbortController()
      aborts.current.set(upload.id, controller)
      uploadPortalFile(orgId, upload.file, {
        signal: controller.signal,
        onProgress: (progress) => patch(upload.id, { progress }),
      })
        .then((stored) => {
          // Taken out while its last bytes were arriving: nothing wants it.
          if (!uploadsRef.current.some((u) => u.id === upload.id)) {
            releasePortalUploads(orgId, [stored.url])
            return
          }
          patch(upload.id, { status: 'done', progress: 1, url: stored.url })
        })
        .catch((error: unknown) => {
          const code = error instanceof PortalUploadError ? error.code : 'failed'
          if (code === 'aborted') return
          patch(upload.id, { status: 'failed', problem: uploadProblemKey(code) })
        })
        .finally(() => aborts.current.delete(upload.id))
    },
    [orgId]
  )

  const addFiles = (list: FileList | File[] | null) => {
    const files = Array.from(list ?? [])
    if (files.length === 0) return
    clear('files')
    const added: Upload[] = []
    let refused: Problem | null = null
    for (const file of files) {
      if (added.length >= room) {
        refused = { key: 'filesTooMany', values: { max: PORTAL_REQUEST_MAX_FILES } }
        break
      }
      const problem = portalUploadProblem(file)
      if (problem) {
        refused = {
          key: uploadProblemKey(problem),
          values: { name: file.name },
        }
        continue
      }
      added.push({
        id: `${Date.now()}-${++uploadSerial}`,
        file,
        kind: portalUploadKind(file.type) as PortalUploadKind,
        preview: URL.createObjectURL(file),
        status: 'uploading',
        progress: 0,
      })
    }
    if (refused) setErrors((prev) => ({ ...prev, files: refused as Problem }))
    if (added.length === 0) return
    setUploads((current) => [...current, ...added])
    for (const upload of added) start(upload)
  }

  const removeUpload = (upload: Upload) => {
    aborts.current.get(upload.id)?.abort()
    if (upload.url) releasePortalUploads(orgId, [upload.url])
    URL.revokeObjectURL(upload.preview)
    setUploads((list) => list.filter((u) => u.id !== upload.id))
    clear('files')
  }

  const retry = (upload: Upload) => {
    patch(upload.id, { status: 'uploading', progress: 0, problem: undefined })
    start(upload)
  }

  const reset = () => {
    setDescription('')
    setTopic(null)
    setPreferredDate('')
    setPreferredTime(null)
    setVehicleId(firstVehicle())
    setMake('')
    setModel('')
    setYear('')
    setPlate('')
    setUploads([])
    setErrors({})
    setSent(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const found = checkServiceRequest(
      { vehicleId, make, model, year, description, topic, preferredDate },
      { today, closedDays, closedWeekdays }
    )
    if (uploading) found.files = { key: 'filesStillUploading' }
    else if (uploads.some((u) => u.status === 'failed')) found.files = { key: 'filesFailed' }
    setErrors(found)
    if (Object.keys(found).length > 0) {
      const first = (['vehicle', 'make', 'model', 'year', 'description', 'date'] as const).find(
        (f) => found[f]
      )
      const ids: Record<string, string> = {
        vehicle: `${formId}-vehicle-${vehicles[0]?.id ?? NEW_VEHICLE}`,
        make: `${formId}-make`,
        model: `${formId}-model`,
        year: `${formId}-year`,
        description: `${formId}-description`,
        date: `${formId}-date`,
      }
      if (first) document.getElementById(ids[first])?.focus()
      return
    }

    // The quick choice leads the customer's own words, as its own line, in
    // the language they are writing in: the workshop reads both together.
    const words = description.trim()
    const text = topic ? [t(`topics.${topic}`), words].filter(Boolean).join('\n\n') : words
    const attachments = uploads.flatMap((u) => (u.url ? [u.url] : []))

    startTransition(async () => {
      const result = await createServiceRequest({
        vehicleId: isNewVehicle ? undefined : vehicleId,
        newVehicle: isNewVehicle
          ? {
              make: make.trim(),
              model: model.trim(),
              year: year ? Number(year) : undefined,
              licensePlate: plate.trim() || undefined,
            }
          : undefined,
        description: text,
        preferredDate: preferredDate || undefined,
        preferredTime: preferredDate && preferredTime ? preferredTime : undefined,
        attachments,
      }).catch(() => ({ success: false as const }))

      if (result.success) {
        // The files belong to the request now: nothing to hand back.
        for (const upload of uploadsRef.current) URL.revokeObjectURL(upload.preview)
        uploadsRef.current = []
        setUploads([])
        setSent(true)
        router.refresh()
      } else {
        // The server's reasons are English (a closed day is the one it words
        // in the customer's language, and the form catches those first), so
        // the customer gets a plain message of their own.
        setErrors({ form: { key: 'submitError' } })
      }
    })
  }

  if (sent) {
    return (
      <PortalPanel className="sm:p-9">
        <div role="status" className="flex flex-col items-start gap-3">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--p-accent)] text-[color:var(--p-on-accent)]"
          >
            <Check className="h-6 w-6" />
          </span>
          <h2 className="p-display text-[28px]">{t('sentTitle', { workshop: workshopName })}</h2>
          <p className="p-muted max-w-[56ch] text-base leading-normal">
            {messagesEnabled ? t('sentBody') : t('sentBodyNoMessages')}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          {messagesEnabled && (
            <PortalLinkButton variant="accent" href={`/portal/${orgId}/messages`}>
              {t('sentMessages')}
            </PortalLinkButton>
          )}
          <PortalLinkButton
            variant={messagesEnabled ? 'outline' : 'accent'}
            href={`/portal/${orgId}/dashboard`}
          >
            {t('sentHome')}
          </PortalLinkButton>
          <PortalButton variant="ghost" onClick={reset}>
            {t('sentAnother')}
          </PortalButton>
        </div>
      </PortalPanel>
    )
  }

  const optional = <span className="p-muted font-normal">{t('optional')}</span>
  const legend = 'mb-2.5 p-0 text-sm font-semibold'
  const choice =
    'flex min-h-16 cursor-pointer items-center gap-3 rounded-[var(--p-radius-field)] border px-4 py-3 has-[:checked]:border-2 has-[:checked]:border-[color:var(--p-ink)] has-[:checked]:px-[15px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[color:var(--p-focus)]'
  const radio = 'h-[18px] w-[18px] shrink-0 accent-[var(--p-ink)] focus-visible:outline-none'

  return (
    <PortalPanel className="sm:p-9">
      <form onSubmit={handleSubmit} className="flex flex-col gap-7" noValidate>
        {/* Which car */}
        <fieldset
          className="m-0 min-w-0 border-0 p-0"
          aria-describedby={errors.vehicle ? `${formId}-vehicle-error` : undefined}
        >
          <legend className={legend}>{t(marine ? 'whichVehicleMarine' : 'whichVehicle')}</legend>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {vehicles.map((v) => (
              <label key={v.id} className={choice}>
                <input
                  type="radio"
                  name={`${formId}-vehicle`}
                  id={`${formId}-vehicle-${v.id}`}
                  className={radio}
                  checked={vehicleId === v.id}
                  onChange={() => {
                    setVehicleId(v.id)
                    clear('vehicle')
                  }}
                />
                <span className="min-w-0">
                  <span className="block break-words text-[15px] font-semibold">
                    {v.make} {v.model}
                  </span>
                  <span className="p-muted block text-[13px]">
                    {[v.licensePlate ?? String(v.year), v.inWorkshop ? t('inWorkshopNow') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </label>
            ))}
            <label
              className={`${choice} border-dashed border-[color:var(--p-line-strong)] has-[:checked]:border-solid`}
            >
              <input
                type="radio"
                name={`${formId}-vehicle`}
                id={`${formId}-vehicle-${NEW_VEHICLE}`}
                className={radio}
                checked={isNewVehicle}
                onChange={() => {
                  setVehicleId(NEW_VEHICLE)
                  clear('vehicle')
                }}
              />
              <span className="text-[15px] font-semibold">
                {t(marine ? 'anotherVehicleMarine' : 'anotherVehicle')}
              </span>
            </label>
          </div>
          {fieldError('vehicle')}
        </fieldset>

        {isNewVehicle && (
          <div className="flex flex-col gap-4 rounded-[var(--p-radius-field)] bg-[var(--p-soft)] p-4 sm:p-5">
            <p className="p-muted text-sm">{t('newVehicleHint')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <PortalField label={t('makeLabel')} htmlFor={`${formId}-make`}>
                <PortalInput
                  id={`${formId}-make`}
                  value={make}
                  onChange={(e) => {
                    setMake(e.target.value)
                    clear('make')
                  }}
                  placeholder={t('makePlaceholder')}
                  maxLength={60}
                  required
                  {...describedBy('make')}
                />
                {fieldError('make')}
              </PortalField>
              <PortalField label={t('modelLabel')} htmlFor={`${formId}-model`}>
                <PortalInput
                  id={`${formId}-model`}
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value)
                    clear('model')
                  }}
                  placeholder={t('modelPlaceholder')}
                  maxLength={60}
                  required
                  {...describedBy('model')}
                />
                {fieldError('model')}
              </PortalField>
              <PortalField
                label={
                  <>
                    {t('yearLabel')} {optional}
                  </>
                }
                htmlFor={`${formId}-year`}
              >
                <PortalInput
                  id={`${formId}-year`}
                  type="number"
                  inputMode="numeric"
                  min={MIN_YEAR}
                  max={maxYear}
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value)
                    clear('year')
                  }}
                  {...describedBy('year')}
                />
                {fieldError('year')}
              </PortalField>
              <PortalField
                label={
                  <>
                    {t(marine ? 'plateLabelMarine' : 'plateLabel')} {optional}
                  </>
                }
                htmlFor={`${formId}-plate`}
              >
                <PortalInput
                  id={`${formId}-plate`}
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  maxLength={20}
                  className="uppercase"
                />
              </PortalField>
            </div>
          </div>
        )}

        {/* What is needed */}
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className={legend}>{t('whatNeeded')}</legend>
          <div className="flex flex-wrap gap-2">
            {topics.map((key) => {
              const on = topic === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setTopic(on ? null : key)
                    clear('description')
                  }}
                  className={[
                    'min-h-11 rounded-[var(--p-radius-control)] border px-4 text-sm',
                    on
                      ? 'border-transparent bg-[var(--p-strong)] font-semibold text-[color:var(--p-on-strong)]'
                      : 'bg-[var(--p-surface)] font-medium text-[color:var(--p-ink)] hover:bg-[var(--p-soft)]',
                  ].join(' ')}
                >
                  {t(`topics.${key}`)}
                </button>
              )
            })}
          </div>
        </fieldset>

        <PortalField
          label={
            <>
              {t('descriptionLabel')} {topic && optional}
            </>
          }
          htmlFor={`${formId}-description`}
        >
          <PortalTextarea
            id={`${formId}-description`}
            placeholder={t(marine ? 'descriptionPlaceholderMarine' : 'descriptionPlaceholder')}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              clear('description')
            }}
            rows={4}
            maxLength={MAX_DESCRIPTION}
            {...describedBy('description')}
          />
          {fieldError('description')}
        </PortalField>

        {/* Photos and video */}
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p id={`${formId}-files-label`} className="text-sm font-semibold">
              {t('filesLabel')} {optional}
            </p>
            <p className="p-muted text-[13px]" aria-live="polite">
              {t('filesCount', { count: uploads.length, max: PORTAL_REQUEST_MAX_FILES })}
              {' · '}
              {t('filesLimits', {
                photo: megabytes(PORTAL_PHOTO_MAX_BYTES),
                video: megabytes(PORTAL_VIDEO_MAX_BYTES),
              })}
            </p>
          </div>

          <input
            ref={pickerRef}
            type="file"
            accept={PORTAL_UPLOAD_ACCEPT}
            multiple
            hidden
            data-testid="portal-file-picker"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {/* A phone opens its camera straight away for this one. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            data-testid="portal-camera"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          <ul
            aria-labelledby={`${formId}-files-label`}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          >
            {uploads.map((upload) => (
              <li
                key={upload.id}
                data-status={upload.status}
                className="relative h-[108px] rounded-[var(--p-radius-field)] bg-[var(--p-photo)]"
              >
                <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
                  {upload.kind === 'image' ? (
                    <img src={upload.preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <>
                      <video
                        src={upload.preview}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                      <span
                        aria-hidden
                        className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </span>
                    </>
                  )}
                  {upload.status === 'uploading' && (
                    <div className="absolute inset-0 flex items-end bg-black/35 p-3">
                      <div
                        role="progressbar"
                        aria-label={t('fileUploading', { name: upload.file.name })}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(upload.progress * 100)}
                        className="h-1.5 w-full overflow-hidden rounded-full bg-white"
                      >
                        <div
                          className="h-full bg-[var(--p-accent)]"
                          style={{ width: `${Math.round(upload.progress * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {upload.status === 'failed' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 p-2 text-center text-white">
                      <p role="alert" className="text-[12px] font-semibold leading-tight">
                        {t(upload.problem ?? 'fileFailed', { name: upload.file.name })}
                      </p>
                      <button
                        type="button"
                        onClick={() => retry(upload)}
                        className="inline-flex min-h-8 items-center gap-1 rounded px-1.5 text-[12px] font-semibold underline"
                      >
                        <RotateCw className="h-3 w-3" aria-hidden />
                        {t('fileRetry')}
                      </button>
                    </div>
                  )}
                </div>
                <span className="sr-only">
                  {upload.status === 'done' ? t('fileReady', { name: upload.file.name }) : ''}
                </span>
                <button
                  type="button"
                  aria-label={t('fileRemove', { name: upload.file.name })}
                  onClick={() => removeUpload(upload)}
                  className="absolute -right-2.5 -top-2.5 flex h-11 w-11 items-center justify-center rounded-full"
                >
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--p-strong)] text-[color:var(--p-on-strong)] shadow-[0_0_0_2px_var(--p-surface)]">
                    <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                  </span>
                </button>
              </li>
            ))}
            {room > 0 && (
              <li
                className={
                  uploads.length === 0
                    ? 'col-span-2 sm:col-span-3 lg:col-span-6'
                    : uploads.length % 2 === 0
                      ? 'col-span-2 sm:col-span-1 lg:col-span-2'
                      : 'sm:col-span-1 lg:col-span-2'
                }
              >
                <button
                  type="button"
                  onClick={() => pickerRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    addFiles(e.dataTransfer.files)
                  }}
                  className={[
                    'flex h-[108px] w-full flex-col items-center justify-center gap-1 rounded-[var(--p-radius-field)] border-[1.5px] border-dashed border-[color:var(--p-line-strong)] px-3 text-center text-[color:var(--p-ink)]',
                    dragging ? 'bg-[var(--p-soft)]' : 'bg-[var(--p-thread)]',
                  ].join(' ')}
                >
                  <ImagePlus className="h-6 w-6" aria-hidden />
                  <span className="text-[15px] font-semibold">{t('filesAdd')}</span>
                  {uploads.length === 0 && (
                    <span className="p-muted hidden text-[13px] lg:block">{t('filesDrop')}</span>
                  )}
                </button>
              </li>
            )}
          </ul>
          {room > 0 && (
            <PortalButton
              className="self-start lg:hidden"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {t('filesCamera')}
            </PortalButton>
          )}
          {fieldError('files')}
        </div>

        {/* When */}
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <PortalField
            label={
              <>
                {t('dayLabel')} {optional}
              </>
            }
            htmlFor={`${formId}-date`}
          >
            <PortalInput
              id={`${formId}-date`}
              type="date"
              value={preferredDate}
              onChange={(e) => {
                const day = e.target.value
                setPreferredDate(day)
                // A part of the day the workshop is shut for is not kept.
                if (
                  preferredTime &&
                  !(day && openDayParts(week?.[weekdayOf(day)]).includes(preferredTime))
                ) {
                  setPreferredTime(null)
                }
                clear('date')
              }}
              min={today}
              {...describedBy('date')}
            />
            {fieldError('date')}
          </PortalField>

          <div className="p-field">
            <p id={`${formId}-time-label`} className="p-field__label">
              {t('timeLabel')}
            </p>
            <div className="p-segmented" role="group" aria-labelledby={`${formId}-time-label`}>
              {([null, 'morning', 'afternoon'] as const).map((part) => (
                <button
                  key={part ?? 'any'}
                  type="button"
                  aria-pressed={preferredTime === part}
                  disabled={part !== null && !dayParts.includes(part)}
                  onClick={() => setPreferredTime(part)}
                  className="disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {t(part ? `time.${part}` : 'time.any')}
                </button>
              ))}
            </div>
            {!preferredDate && <p className="p-field__hint">{t('timeHint')}</p>}
          </div>
        </div>

        {closedDays.length > 0 && (
          <div className="p-muted -mt-3 text-[13px]" data-testid="portal-closed-days">
            <p>{t('closedDaysHint')}</p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {closedDays.slice(0, 8).map((d) => (
                <li key={d.date} className="break-words">
                  {formatDay(d.date, locale, { year: false })} ({d.name})
                </li>
              ))}
            </ul>
          </div>
        )}

        {errors.form && (
          <PortalNotice tone="danger" role="alert">
            {message('form')}
          </PortalNotice>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <PortalButton
            type="submit"
            variant="accent"
            size="lg"
            pending={isPending}
            className="w-full sm:w-auto"
          >
            {t('send', { workshop: workshopName })}
          </PortalButton>
          <p className="p-muted text-sm">{t('sendHint')}</p>
        </div>
      </form>
    </PortalPanel>
  )
}
