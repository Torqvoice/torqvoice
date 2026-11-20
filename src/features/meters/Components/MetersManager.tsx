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
import { createMeterType, deleteMeterType, updateMeterType } from '../Actions/meterTypeActions'
import { METER_NAME_MAX_LENGTH, METER_UNIT_MAX_LENGTH } from '../Schema/meterSchema'

export interface MeterTypeRow {
  id: string
  name: string
  unit: string
  isActive: boolean
  _count: { vehicleMeters: number }
}

/**
 * The workshop's meters besides the odometer, on the Custom Fields page.
 * Defining the first one is what turns meters on: until then no vehicle,
 * job or document shows anything about them. Two suggestions are one click
 * away, in the workshop's language.
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
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<MeterTypeRow | null>(null)

  const create = async (meter: { name: string; unit: string }) => {
    if (!meter.name.trim()) return
    setSaving(true)
    const result = await createMeterType(meter)
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('created', { name: meter.name.trim() }))
    setName('')
    setUnit('')
    router.refresh()
  }

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
                  onClick={() => setEditing(meter)}
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

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void create({ name, unit })
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-xs">
          <Label htmlFor="meter-name">{t('name')}</Label>
          <Input
            id="meter-name"
            value={name}
            maxLength={METER_NAME_MAX_LENGTH}
            placeholder={t('namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="w-28 space-y-1.5">
          <Label htmlFor="meter-unit">{t('unit')}</Label>
          <Input
            id="meter-unit"
            value={unit}
            maxLength={METER_UNIT_MAX_LENGTH}
            placeholder={t('unitPlaceholder')}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" className="h-9" disabled={saving || !name.trim()}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('add')}
        </Button>
      </form>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('suggestions')}</span>
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion.name}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              disabled={saving}
              onClick={() => create(suggestion)}
            >
              <Plus className="mr-1 h-3 w-3" />
              {suggestion.name}
              {suggestion.unit && (
                <span className="ml-1 text-muted-foreground">({suggestion.unit})</span>
              )}
            </Button>
          ))}
        </div>
      )}

      {editing && <EditMeterDialog meter={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function EditMeterDialog({ meter, onClose }: { meter: MeterTypeRow; onClose: () => void }) {
  const t = useTranslations('settings.meters')
  const tc = useTranslations('common.buttons')
  const router = useRouter()
  const [name, setName] = useState(meter.name)
  const [unit, setUnit] = useState(meter.unit)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const result = await updateMeterType({ id: meter.id, name, unit })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('updated', { name: name.trim() }))
    onClose()
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-meter-name">{t('name')}</Label>
            <Input
              id="edit-meter-name"
              value={name}
              maxLength={METER_NAME_MAX_LENGTH}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-meter-unit">{t('unit')}</Label>
            <Input
              id="edit-meter-unit"
              value={unit}
              maxLength={METER_UNIT_MAX_LENGTH}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('editHint')}</p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={saving || !name.trim()}>
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
