'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Gauge, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useConfirm } from '@/components/confirm-dialog'
import { useServiceType } from '@/components/service-type-context'
import { deleteMeterType, saveMeterType, updateMeterType } from '../Actions/meterTypeActions'
import {
  METER_NAME_MAX_LENGTH,
  METER_UNIT_MAX_LENGTH,
  type MeterTypeOptions,
} from '../Schema/meterSchema'
import {
  DEFAULT_METER_TYPE_OPTIONS,
  METER_TYPE_OPTION_KEYS,
  meterTypeOptionsOf,
} from '../Lib/meterTypeOptions'

export interface MeterTypeRow {
  id: string
  name: string
  unit: string
  isActive: boolean
  required: boolean
  _count: { vehicleMeters: number }
}

/** What the dialog opens on: a meter being edited, or a new one, blank or from a suggestion. */
type MeterDialogTarget =
  | { kind: 'edit'; meter: MeterTypeRow }
  | { kind: 'new'; name: string; unit: string }

/**
 * The workshop's meters besides the odometer, on the Custom Fields page.
 * Defining the first one is what turns meters on: until then no vehicle,
 * job or document shows anything about them. A meter is added and edited in
 * one dialog, with its options; a suggestion, in the workshop's language,
 * opens that dialog filled in.
 */
export function MetersManager({
  meters,
  suggestions,
}: {
  meters: MeterTypeRow[]
  suggestions: { name: string; unit: string }[]
}) {
  const t = useTranslations('settings.meters')
  const isMarine = useServiceType() === 'marine'
  const router = useRouter()
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<MeterDialogTarget | null>(null)

  const toggle = async (meter: MeterTypeRow, isActive: boolean) => {
    const result = await updateMeterType({ id: meter.id, isActive })
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    router.refresh()
  }

  const remove = async (meter: MeterTypeRow) => {
    const ok = await confirm({
      title: t('deleteTitle', { name: meter.name }),
      description: t(isMarine ? 'deleteHintMarine' : 'deleteHint', {
        count: meter._count.vehicleMeters,
      }),
      confirmLabel: t('delete'),
      destructive: true,
      irreversible: true,
    })
    if (!ok) return
    const result = await deleteMeterType(meter.id)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('deleted', { name: meter.name }))
    router.refresh()
  }

  return (
    <section className="space-y-3" data-testid="meters-manager" id="meters">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(isMarine ? 'descriptionMarine' : 'description')}
        </p>
      </div>

      {meters.length > 0 && (
        <div className="divide-y rounded-lg border">
          {meters.map((meter) => (
            <div
              key={meter.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
              data-testid={`meter-type-${meter.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{meter.name}</span>
                  {meter.unit && (
                    <span className="text-xs text-muted-foreground">{meter.unit}</span>
                  )}
                  {meter.required && (
                    <Badge variant="secondary" data-testid="meter-required-badge">
                      {t('requiredBadge')}
                    </Badge>
                  )}
                  {!meter.isActive && <Badge variant="outline">{t('hidden')}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(isMarine ? 'onVehiclesMarine' : 'onVehicles', {
                    count: meter._count.vehicleMeters,
                  })}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Label className="mr-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={meter.isActive}
                    onCheckedChange={(checked) => toggle(meter, checked)}
                    aria-label={t('inUse', { name: meter.name })}
                  />
                  {t('inUseShort')}
                </Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setDialog({ kind: 'edit', meter })}
                  aria-label={t('edit', { name: meter.name })}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(meter)}
                  aria-label={t('deleteNamed', { name: meter.name })}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => setDialog({ kind: 'new', name: '', unit: '' })}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('add')}
        </Button>
        {suggestions.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground">{t('suggestions')}</span>
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion.name}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setDialog({ kind: 'new', ...suggestion })}
              >
                <Plus className="mr-1 h-3 w-3" />
                {suggestion.name}
                {suggestion.unit && (
                  <span className="ml-1 text-muted-foreground">({suggestion.unit})</span>
                )}
              </Button>
            ))}
          </>
        )}
      </div>

      {dialog && <MeterDialog target={dialog} onClose={() => setDialog(null)} />}
    </section>
  )
}

/**
 * Adding a meter and editing one: its name, its unit and its options, one
 * switch each (meterTypeOptions.ts), saved together.
 */
function MeterDialog({ target, onClose }: { target: MeterDialogTarget; onClose: () => void }) {
  const t = useTranslations('settings.meters')
  const tc = useTranslations('common.buttons')
  const router = useRouter()
  const editing = target.kind === 'edit' ? target.meter : null
  const [name, setName] = useState(
    editing ? editing.name : target.kind === 'new' ? target.name : ''
  )
  const [unit, setUnit] = useState(
    editing ? editing.unit : target.kind === 'new' ? target.unit : ''
  )
  const [options, setOptions] = useState<MeterTypeOptions>(
    editing ? meterTypeOptionsOf(editing) : DEFAULT_METER_TYPE_OPTIONS
  )
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    const result = await saveMeterType({ id: editing?.id, name, unit, options })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t(editing ? 'updated' : 'created', { name: name.trim() }))
    onClose()
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? t('editTitle') : t('addTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="meter-name">{t('name')}</Label>
                <Input
                  id="meter-name"
                  value={name}
                  maxLength={METER_NAME_MAX_LENGTH}
                  placeholder={t('namePlaceholder')}
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meter-unit">{t('unit')}</Label>
                <Input
                  id="meter-unit"
                  value={unit}
                  maxLength={METER_UNIT_MAX_LENGTH}
                  placeholder={t('unitPlaceholder')}
                  autoComplete="off"
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>
            </div>
            {METER_TYPE_OPTION_KEYS.map((key) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor={`meter-option-${key}`}>{t(`options.${key}`)}</Label>
                  <p id={`meter-option-${key}-hint`} className="text-xs text-muted-foreground">
                    {t(`options.${key}Hint`)}
                  </p>
                </div>
                <Switch
                  id={`meter-option-${key}`}
                  checked={options[key]}
                  aria-describedby={`meter-option-${key}-hint`}
                  onCheckedChange={(checked) => setOptions((prev) => ({ ...prev, [key]: checked }))}
                />
              </div>
            ))}
            {editing && <p className="text-xs text-muted-foreground">{t('editHint')}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" data-save-shortcut disabled={saving || !name.trim()}>
              {editing ? tc('save') : t('add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
