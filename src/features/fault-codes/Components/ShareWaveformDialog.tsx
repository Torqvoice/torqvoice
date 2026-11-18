'use client'

import { useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  CircleCheck,
  FileSpreadsheet,
  ImageIcon,
  Loader2,
  Settings2,
  Smartphone,
  TriangleAlert,
  Upload,
  Waves,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { track } from '@/lib/analytics'
import { useServiceType } from '@/components/service-type-context'
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
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/features/integrations/Lib/format-bytes'
import type {
  FaultCodeOwnWaveform,
  WaveformCondition,
  WaveformFileRole,
  WaveformKind,
  WaveformPreview,
} from '@/features/integrations/Lib/types'
import type { CodeVehicle } from '../Lib/types'
import { previewCsv, waveformRole } from '../Lib/waveformCsv'
import {
  MAX_FIX_TEXT,
  MAX_WAVEFORM_IMAGE_BYTES,
  MAX_WAVEFORM_RECORDING_BYTES,
  MAX_WAVEFORM_SETTINGS_BYTES,
  WAVEFORM_CONDITIONS,
} from '../Schema/faultCodeSchema'
import { fixVehicleLine } from './FixPhotos'
import { PhoneCodePanel, usePhoneDraft, uuid } from './PhoneCode'
import { WaveformChart } from './WaveformChart'
import { useConditionLabel } from './WaveformParts'

const SHARE_URL = '/api/protected/fault-codes/waveforms'
const ROLES: WaveformFileRole[] = ['psdata', 'csv', 'image', 'pssettings']
const LIMITS: Record<WaveformFileRole, number> = {
  psdata: MAX_WAVEFORM_RECORDING_BYTES,
  csv: MAX_WAVEFORM_RECORDING_BYTES,
  pssettings: MAX_WAVEFORM_SETTINGS_BYTES,
  image: MAX_WAVEFORM_IMAGE_BYTES,
}
const ICONS: Record<WaveformFileRole, typeof Waves> = {
  psdata: Waves,
  pssettings: Settings2,
  csv: FileSpreadsheet,
  image: ImageIcon,
}
/** What technicians measure most, offered as a tap; the words are theirs to change. */
const MEASUREMENTS = [
  'crank',
  'camCrank',
  'injector',
  'ignition',
  'compression',
  'lambda',
  'maf',
  'alternator',
  'canBus',
  'fuelPump',
] as const

type Picked = { file: File; url?: string }
type ShareReply = { success: true; data: FaultCodeOwnWaveform } | { success: false; error?: string }
const FAILURES = ['photo', 'csv', 'too_large', 'no_file', 'paused', 'demo'] as const
type Failure = (typeof FAILURES)[number]

/** A form sent with its upload progress, which a fetch cannot tell. */
function upload(form: FormData, onProgress: (share: number) => void): Promise<ShareReply | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', SHARE_URL)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as ShareReply)
      } catch {
        resolve(null)
      }
    }
    xhr.onerror = () => resolve(null)
    xhr.send(form)
  })
}

/**
 * Sharing a scope recording for a code, made for a technician at the bench rather than at a
 * desk: known good or faulty as two big buttons, what was measured from a tap, how the
 * engine ran, and one place to drop whatever files they have. Each file is sorted by its
 * kind as it lands; a CSV export is drawn at once, so they see what others will see. A photo
 * of the scope screen can come from their phone through a code. What was filled in stays
 * when the dialog is closed, until it is shared.
 */
export function ShareWaveformDialog({
  open,
  onOpenChange,
  code,
  label = code,
  meaning = null,
  makes = null,
  vehicle,
  onShared,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  code: string
  label?: string
  meaning?: { id: string; title: string } | null
  makes?: string[] | null
  vehicle: CodeVehicle | null
  onShared: (waveform: FaultCodeOwnWaveform) => void
}) {
  const t = useTranslations('faultCodes.waveforms.shareDialog')
  const tw = useTranslations('faultCodes.waveforms')
  const ts = useTranslations('faultCodes.share')
  const locale = useLocale()
  const isMarine = useServiceType() === 'marine'
  const conditionLabel = useConditionLabel()
  const [kind, setKind] = useState<WaveformKind | null>(null)
  const [title, setTitle] = useState('')
  const [condition, setCondition] = useState<WaveformCondition | null>(null)
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<Partial<Record<WaveformFileRole, Picked>>>({})
  const [preview, setPreview] = useState<WaveformPreview | null>(null)
  const [csvBad, setCsvBad] = useState(false)
  const defaultMake = makes?.[0] ?? ''
  const [make, setMake] = useState(defaultMake)
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [draftId, setDraftId] = useState(uuid)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const phone = usePhoneDraft({
    active: open && phoneOpen,
    code,
    draftId,
    purpose: 'waveform',
  })
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const phonePhoto = files.image ? null : (phone.photos[0] ?? null)
  const hasLookable = Boolean(files.psdata || files.csv || files.image || phonePhoto)
  const tooLong = note.length > MAX_FIX_TEXT
  const sending = progress !== null
  const missing = !kind
    ? t('missing.kind')
    : !title.trim()
      ? t('missing.title')
      : !hasLookable
        ? t('missing.file')
        : csvBad
          ? t('missing.csv')
          : null

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return
    const next = { ...files }
    for (const file of Array.from(list)) {
      const role = waveformRole(file.name, file.type)
      if (!role) {
        toast.error(t('notAScopeFile', { name: file.name }))
        continue
      }
      if (file.size > LIMITS[role]) {
        toast.error(t('fileTooBig', { name: file.name, size: formatBytes(LIMITS[role]) }))
        continue
      }
      if (next[role]?.url) URL.revokeObjectURL(next[role].url as string)
      next[role] = { file, url: role === 'image' ? URL.createObjectURL(file) : undefined }
      if (role === 'csv') {
        const drawn = previewCsv(await file.text().catch(() => ''))
        setPreview(drawn)
        setCsvBad(!drawn)
      }
    }
    setFiles(next)
    if (fileInput.current) fileInput.current.value = ''
  }

  const removeFile = (role: WaveformFileRole) => {
    const url = files[role]?.url
    if (url) URL.revokeObjectURL(url)
    setFiles(({ [role]: _gone, ...rest }) => rest)
    if (role === 'csv') {
      setPreview(null)
      setCsvBad(false)
    }
  }

  const reset = () => {
    for (const p of Object.values(files)) if (p?.url) URL.revokeObjectURL(p.url)
    setKind(null)
    setTitle('')
    setCondition(null)
    setNote('')
    setFiles({})
    setPreview(null)
    setCsvBad(false)
    setMake(defaultMake)
    setModel('')
    setYear('')
    setPhoneOpen(false)
    phone.setPhotos([])
    setDraftId(uuid())
  }

  const send = async () => {
    if (missing || tooLong || sending || !kind) return
    const form = new FormData()
    form.append('code', code)
    if (meaning) form.append('meaning', meaning.id)
    form.append('kind', kind)
    form.append('title', title.trim())
    if (condition) form.append('condition', condition)
    if (note.trim()) form.append('note', note.trim())
    form.append('lang', locale)
    if (phonePhoto) form.append('draftId', draftId)
    if (vehicle) {
      form.append('vehicleId', vehicle.id)
    } else {
      if (make.trim()) form.append('make', make.trim())
      if (model.trim()) form.append('model', model.trim())
      if (year.trim()) form.append('year', year.trim())
    }
    for (const role of ROLES) {
      const picked = files[role]
      if (picked) form.append(role, picked.file, picked.file.name)
    }
    setProgress(0)
    const reply = await upload(form, setProgress)
    setProgress(null)
    if (reply?.success) {
      track('fault_code:waveform_share', {
        code,
        kind,
        condition: condition ?? null,
        psdata: Boolean(files.psdata),
        csv: Boolean(files.csv),
        image: Boolean(files.image || phonePhoto),
        from_phone: Boolean(phonePhoto),
      })
      onShared(reply.data)
      reset()
      onOpenChange(false)
      toast.success(t('sent'))
      return
    }
    // What was filled in stays, ready to try again.
    const error = reply && !reply.success ? reply.error : undefined
    const failure = FAILURES.find((f) => f === error) as Failure | undefined
    toast.error(failure ? t(`errors.${failure}`) : t('errors.failed'))
  }

  const listed = ROLES.filter((r) => files[r])

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title', { code: label })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {meaning && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-card-edge bg-muted/30 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {ts('meaning')}
              </span>
              <span className="text-sm font-medium">{meaning.title}</span>
              <span className="w-full text-xs text-muted-foreground">{t('meaningHint')}</span>
            </div>
          )}

          {/* Known good or faulty: the first thing anyone looking for one asks. */}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t('kind')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['good', 'faulty'] as const).map((k) => {
                const on = kind === k
                const Icon = k === 'good' ? CircleCheck : TriangleAlert
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setKind(k)}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors',
                      on
                        ? k === 'good'
                          ? 'border-emerald-500/70 bg-emerald-500/10'
                          : 'border-amber-500/70 bg-amber-500/10'
                        : 'border-border hover:border-primary/40 hover:bg-muted/40'
                    )}
                  >
                    <Icon
                      className={cn(
                        'mt-0.5 size-5 shrink-0',
                        k === 'good'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      )}
                      aria-hidden
                    />
                    <span className="space-y-0.5">
                      <span className="block font-medium">{tw(`kind.${k}`)}</span>
                      <span className="block text-sm text-muted-foreground">
                        {isMarine ? t(`kindHint.${k}Marine`) : t(`kindHint.${k}`)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* What was measured: a tap fills it, the words stay theirs. */}
          <div className="space-y-2">
            <Label htmlFor={`wave-title-${code}`} className="text-sm font-medium">
              {t('measured')}
            </Label>
            <Input
              id={`wave-title-${code}`}
              value={title}
              maxLength={120}
              placeholder={t('measuredPlaceholder')}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {MEASUREMENTS.map((m) => {
                const words = t(`measurements.${m}`)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTitle(words)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-primary/50 hover:bg-primary/5',
                      title === words
                        ? 'border-primary/60 bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    {words}
                  </button>
                )
              })}
            </div>
          </div>

          {/* How the engine ran: optional, one tap, tap again to clear. */}
          <div className="space-y-2">
            <span className="text-sm font-medium">{t('condition')}</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('condition')}>
              {WAVEFORM_CONDITIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={condition === c}
                  onClick={() => setCondition((now) => (now === c ? null : c))}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    condition === c
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40'
                  )}
                >
                  {conditionLabel(c)}
                </button>
              ))}
            </div>
          </div>

          {/* Every file in one place: each is sorted by what it is as it lands. */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('files')}</span>
                <p className="text-xs text-muted-foreground">{t('filesHint')}</p>
              </div>
              <Button
                type="button"
                variant={phoneOpen ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setPhoneOpen((v) => !v)}
                aria-expanded={phoneOpen}
              >
                <Smartphone />
                {phoneOpen ? ts('phone.hide') : t('phone.button')}
              </Button>
            </div>

            {phoneOpen && (
              <PhoneCodePanel
                link={phone.link}
                failed={phone.failed}
                title={t('phone.title')}
                body={t('phone.body')}
                received={phone.photos.length > 0 ? t('phone.received') : null}
              />
            )}

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
                void addFiles(e.dataTransfer.files)
              }}
              className={cn(
                'flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 text-center text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
                listed.length === 0 && !phonePhoto ? 'py-9' : 'py-4',
                dragging && 'border-primary/60 bg-primary/5'
              )}
            >
              <Upload className="size-5" aria-hidden />
              <span className="text-sm font-medium text-foreground">
                {listed.length === 0 && !phonePhoto ? t('drop') : t('dropMore')}
              </span>
              <span>{t('dropTypes')}</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".psdata,.pssettings,.csv,.txt,image/*"
              multiple
              hidden
              data-testid="waveform-file-input"
              onChange={(e) => void addFiles(e.target.files)}
            />

            {(listed.length > 0 || phonePhoto) && (
              <ul className="divide-y divide-card-edge/60 rounded-lg border border-card-edge">
                {listed.map((role) => {
                  const picked = files[role] as Picked
                  const Icon = ICONS[role]
                  return (
                    <li key={role} className="flex items-center gap-3 px-3 py-2.5">
                      {picked.url ? (
                        <img
                          src={picked.url}
                          alt=""
                          className="size-9 shrink-0 rounded border border-card-edge object-cover"
                        />
                      ) : (
                        <span className="flex size-9 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                          <Icon className="size-4" aria-hidden />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{t(`role.${role}`)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {picked.file.name} · {formatBytes(picked.file.size)}
                        </span>
                        {role === 'csv' && csvBad && (
                          <span className="block text-xs font-medium text-destructive">
                            {t('csvNotScope')}
                          </span>
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        aria-label={t('remove', { name: picked.file.name })}
                        onClick={() => removeFile(role)}
                      >
                        <X />
                      </Button>
                    </li>
                  )
                })}
                {phonePhoto && (
                  <li className="flex items-center gap-3 px-3 py-2.5">
                    <img
                      src={phonePhoto.url}
                      alt=""
                      className="size-9 shrink-0 rounded border border-card-edge object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{t('role.image')}</span>
                      <span className="block text-xs text-muted-foreground">{t('fromPhone')}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      aria-label={t('remove', { name: t('role.image') })}
                      onClick={() => void phone.remove(phonePhoto.id)}
                    >
                      <X />
                    </Button>
                  </li>
                )}
              </ul>
            )}

            {preview && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{t('previewHint')}</p>
                <WaveformChart preview={preview} />
              </div>
            )}
            {files.psdata && !files.csv && (
              <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {t('csvTip')}
              </p>
            )}
          </div>

          {/* The car: from the job, or typed, all of it optional. */}
          {vehicle ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-card-edge bg-muted/30 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {isMarine ? ts('vehicleMarine') : ts('vehicle')}
              </span>
              <span className="text-sm font-medium">{fixVehicleLine(vehicle)}</span>
              <span className="w-full text-xs text-muted-foreground">
                {isMarine ? ts('vehicleHintMarine') : ts('vehicleHint')}
              </span>
            </div>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {isMarine ? ts('vehicleOptionalMarine') : ts('vehicleOptional')}
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
                <div className="space-y-1.5">
                  <Label htmlFor={`wave-make-${code}`} className="text-xs text-muted-foreground">
                    {ts('make')}
                  </Label>
                  {makes ? (
                    <SearchableSelect
                      id={`wave-make-${code}`}
                      value={make}
                      onValueChange={setMake}
                      options={makes.map((m) => ({ value: m, label: m }))}
                    />
                  ) : (
                    <Input
                      id={`wave-make-${code}`}
                      value={make}
                      maxLength={60}
                      onChange={(e) => setMake(e.target.value)}
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`wave-model-${code}`} className="text-xs text-muted-foreground">
                    {ts('model')}
                  </Label>
                  <Input
                    id={`wave-model-${code}`}
                    value={model}
                    maxLength={60}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`wave-year-${code}`} className="text-xs text-muted-foreground">
                    {ts('year')}
                  </Label>
                  <Input
                    id={`wave-year-${code}`}
                    value={year}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {isMarine ? ts('vehicleHintMarine') : ts('vehicleHint')}
              </p>
            </fieldset>
          )}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor={`wave-note-${code}`} className="text-sm font-medium">
                {t('note')}
              </Label>
              {note.length > MAX_FIX_TEXT * 0.8 && (
                <span
                  className={cn(
                    'text-xs tabular-nums text-muted-foreground',
                    tooLong && 'font-medium text-destructive'
                  )}
                >
                  {ts('characters', { count: note.length, max: MAX_FIX_TEXT })}
                </span>
              )}
            </div>
            <Textarea
              id={`wave-note-${code}`}
              value={note}
              rows={3}
              placeholder={isMarine ? t('notePlaceholderMarine') : t('notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </DialogBody>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {sending
              ? t('sending', { percent: Math.round((progress ?? 0) * 100) })
              : (missing ?? '')}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={sending}
              onClick={() => onOpenChange(false)}
            >
              {ts('cancel')}
            </Button>
            <Button
              type="button"
              disabled={Boolean(missing) || tooLong || sending}
              onClick={() => void send()}
            >
              {sending ? <Loader2 className="animate-spin" /> : <Upload />}
              {t('send')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
