'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
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
import { useServiceType } from '@/components/service-type-context'
import { VehicleCombobox } from '@/features/quotes/Components/VehicleCombobox'
import type { EquipmentItemView } from '../Lib/equipment.server'
import { moveEquipmentItem } from '../Actions/equipmentItemActions'

/**
 * Moves an item to another of the workshop's vehicles. It takes its meters,
 * readings, report and the jobs that worked on it along; this vehicle's
 * history says where it went.
 */
export function MoveEquipmentDialog({
  item,
  onClose,
}: {
  item: EquipmentItemView
  onClose: () => void
}) {
  const t = useTranslations('equipment.move')
  const tc = useTranslations('common.buttons')
  const isMarine = useServiceType() === 'marine'
  const router = useRouter()
  const [vehicleId, setVehicleId] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!vehicleId) return
    setSaving(true)
    const result = await moveEquipmentItem({ id: item.id, vehicleId })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('moved', { name: item.label }))
    onClose()
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { name: item.label })}</DialogTitle>
          <DialogDescription>{t(isMarine ? 'hintMarine' : 'hint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <p className="text-sm font-medium">{t(isMarine ? 'toMarine' : 'to')}</p>
          <VehicleCombobox
            value={vehicleId}
            onChange={(id) => setVehicleId(id === item.vehicleId ? '' : id)}
            placeholder={t(isMarine ? 'pickMarine' : 'pick')}
          />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={saving || !vehicleId}>
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
