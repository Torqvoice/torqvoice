'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { FileText, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EquipmentItemView, EquipmentTypeView } from '../Lib/equipment.server'
import { manufactureText, parseManufacture } from '../Lib/equipmentDays'
import {
  addEquipmentItem,
  discardEquipmentReport,
  updateEquipmentItem,
} from '../Actions/equipmentItemActions'
import { EQUIPMENT_NOTES_MAX, EQUIPMENT_TEXT_MAX } from '../Schema/equipmentSchema'

/**
 * Adds a piece of equipment to a vehicle, or edits one. The type comes from
 * the workshop's list; everything else is optional. Manufacture takes a year
 * alone or a full date, as the plate gives it.
 */
export function EquipmentItemDialog({
  vehicleId,
  types,
  item,
  onClose,
}: {
  vehicleId: string
  types: EquipmentTypeView[]
  /** The item to edit; null adds a new one. */
  item: EquipmentItemView | null
  onClose: () => void
}) {
  const t = useTranslations('equipment.form')
  const tc = useTranslations('common.buttons')
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  // A hidden type is offered only to the item that already has it.
  const offered = types.filter((type) => type.isActive || type.id === item?.typeId)
  const [typeId, setTypeId] = useState(item?.typeId ?? offered[0]?.id ?? '')
  const [make, setMake] = useState(item?.make ?? '')
  const [model, setModel] = useState(item?.model ?? '')
  const [serialNumber, setSerialNumber] = useState(item?.serialNumber ?? '')
  const [manufacture, setManufacture] = useState(
    item
      ? manufactureText({
          manufactureYear: item.manufactureYear,
          manufactureDay: item.manufactureDay,
        })
      : ''
  )
  const [installDate, setInstallDate] = useState(item?.installDate ?? '')
  const [ratedCapacity, setRatedCapacity] = useState(item?.ratedCapacity ?? '')
  const [lastExaminedAt, setLastExaminedAt] = useState(item?.lastExaminedAt ?? '')
  const [nextExaminationDue, setNextExaminationDue] = useState(item?.nextExaminationDue ?? '')
  const [certificateReference, setCertificateReference] = useState(item?.certificateReference ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [report, setReport] = useState(item?.report ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const manufactureInvalid = manufacture.trim() !== '' && parseManufacture(manufacture) === null
  // A report uploaded here and not saved yet: the upload wrote it already, so
  // it is let go of when it is taken off or the dialog closes without saving.
  const unsaved = useRef<string | null>(null)
  const discardUnsaved = () => {
    const url = unsaved.current
    unsaved.current = null
    if (url) void discardEquipmentReport(url).catch(() => undefined)
  }
  // While a save is under way the dialog stays open: closing it would let go
  // of a report the save is about to point the item at.
  const savingNow = useRef(false)
  const cancel = () => {
    if (savingNow.current) return
    discardUnsaved()
    onClose()
  }

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch('/api/protected/upload/equipment-report', {
        method: 'POST',
        body,
      })
      const json = (await response.json().catch(() => ({}))) as {
        url?: string
        name?: string
        error?: string
      }
      if (!response.ok || !json.url || !json.name) {
        toast.error(json.error || t('uploadError'))
        return
      }
      discardUnsaved()
      unsaved.current = json.url
      setReport({ url: json.url, name: json.name })
    } catch {
      toast.error(t('uploadError'))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const save = async () => {
    if (!typeId || manufactureInvalid || savingNow.current) return
    savingNow.current = true
    setSaving(true)
    const fields = {
      typeId,
      make,
      model,
      serialNumber,
      manufacture,
      installDate,
      ratedCapacity,
      lastExaminedAt,
      nextExaminationDue,
      certificateReference,
      notes,
      report,
    }
    let result: Awaited<ReturnType<typeof addEquipmentItem>>
    try {
      result = item
        ? await updateEquipmentItem({ id: item.id, ...fields })
        : await addEquipmentItem({ vehicleId, ...fields })
    } catch {
      result = { success: false }
    } finally {
      savingNow.current = false
      setSaving(false)
    }
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    // Saved: the item points at it now.
    unsaved.current = null
    toast.success(item ? t('updated') : t('added'))
    onClose()
    router.refresh()
  }

  const text = (
    id: string,
    label: string,
    value: string,
    set: (value: string) => void,
    placeholder?: string
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        maxLength={EQUIPMENT_TEXT_MAX}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  )

  return (
    <Dialog open onOpenChange={(next) => !next && cancel()}>
      <DialogContent className="sm:max-w-lg" data-testid="equipment-dialog" closeDisabled={saving}>
        <DialogHeader>
          <DialogTitle>{item ? t('editTitle') : t('addTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="equipment-type">{t('type')}</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger id="equipment-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {offered.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('equipment-make', t('make'), make, setMake)}
            {text('equipment-model', t('model'), model, setModel)}
            {text('equipment-serial', t('serialNumber'), serialNumber, setSerialNumber)}
            <div className="space-y-1.5">
              <Label htmlFor="equipment-manufacture">{t('manufacture')}</Label>
              <Input
                id="equipment-manufacture"
                value={manufacture}
                maxLength={10}
                inputMode="numeric"
                placeholder={t('manufacturePlaceholder')}
                aria-invalid={manufactureInvalid || undefined}
                aria-describedby="equipment-manufacture-hint"
                onChange={(e) => setManufacture(e.target.value)}
              />
              <p
                id="equipment-manufacture-hint"
                className={
                  manufactureInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
                }
              >
                {manufactureInvalid ? t('manufactureInvalid') : t('manufactureHint')}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equipment-install">{t('installDate')}</Label>
              <DateInput id="equipment-install" value={installDate} onChange={setInstallDate} />
            </div>
            {text(
              'equipment-capacity',
              t('ratedCapacity'),
              ratedCapacity,
              setRatedCapacity,
              t('ratedCapacityPlaceholder')
            )}
            <div className="space-y-1.5">
              <Label htmlFor="equipment-last-examined">{t('lastExaminedAt')}</Label>
              <DateInput
                id="equipment-last-examined"
                value={lastExaminedAt}
                onChange={setLastExaminedAt}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equipment-next-examination">{t('nextExaminationDue')}</Label>
              <DateInput
                id="equipment-next-examination"
                value={nextExaminationDue}
                onChange={setNextExaminationDue}
              />
            </div>
          </div>
          {text(
            'equipment-certificate',
            t('certificateReference'),
            certificateReference,
            setCertificateReference
          )}
          <div className="space-y-1.5">
            <span className="text-sm font-medium" id="equipment-report-label">
              {t('report')}
            </span>
            {report ? (
              <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a
                  href={report.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
                >
                  {report.name}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={saving}
                  onClick={() => {
                    if (unsaved.current === report.url) discardUnsaved()
                    setReport(null)
                  }}
                  aria-label={t('removeReport', { name: report.name })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || saving}
                aria-describedby="equipment-report-label"
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="mr-1 h-3.5 w-3.5" />
                {uploading ? t('uploading') : t('attachReport')}
              </Button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void upload(file)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipment-notes">{t('notes')}</Label>
            <Textarea
              id="equipment-notes"
              value={notes}
              maxLength={EQUIPMENT_NOTES_MAX}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancel} disabled={saving}>
            {tc('cancel')}
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving || uploading || !typeId || manufactureInvalid}
          >
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
