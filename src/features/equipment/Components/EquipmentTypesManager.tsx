'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
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
import {
  createEquipmentType,
  deleteEquipmentType,
  reorderEquipmentTypes,
  updateEquipmentType,
} from '../Actions/equipmentTypeActions'
import { EQUIPMENT_TYPE_NAME_MAX } from '../Schema/equipmentSchema'

export interface EquipmentTypeRow {
  id: string
  name: string
  isActive: boolean
  _count: { items: number }
}

/**
 * The workshop's kinds of equipment, on the Custom Fields page. Adding the
 * first one is what turns equipment on: until then no vehicle, job or
 * document shows anything about it. Types can be renamed, put in order and
 * hidden; one with items can only be hidden, never deleted.
 */
export function EquipmentTypesManager({ types: initial }: { types: EquipmentTypeRow[] }) {
  const t = useTranslations('equipment.types')
  const isMarine = useServiceType() === 'marine'
  const router = useRouter()
  const confirm = useConfirm()
  const [types, setTypes] = useState(initial)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<EquipmentTypeRow | null>(null)
  useEffect(() => setTypes(initial), [initial])

  const create = async () => {
    if (!name.trim()) return
    setSaving(true)
    const result = await createEquipmentType({ name })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('created', { name: name.trim() }))
    setName('')
    router.refresh()
  }

  const toggle = async (type: EquipmentTypeRow, isActive: boolean) => {
    const result = await updateEquipmentType({ id: type.id, isActive })
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    router.refresh()
  }

  const move = async (index: number, by: -1 | 1) => {
    const next = [...types]
    const [moved] = next.splice(index, 1)
    next.splice(index + by, 0, moved)
    setTypes(next)
    const result = await reorderEquipmentTypes({ ids: next.map((type) => type.id) })
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      setTypes(types)
      return
    }
    router.refresh()
  }

  const remove = async (type: EquipmentTypeRow) => {
    const ok = await confirm({
      title: t('deleteTitle', { name: type.name }),
      description: t('deleteHint'),
      confirmLabel: t('delete'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteEquipmentType(type.id)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('deleted', { name: type.name }))
    router.refresh()
  }

  return (
    <section className="space-y-3" data-testid="equipment-types-manager" id="equipment">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(isMarine ? 'descriptionMarine' : 'description')}
        </p>
      </div>

      {types.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {types.map((type, index) => (
            <li
              key={type.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
              data-testid={`equipment-type-${type.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{type.name}</span>
                  {!type.isActive && <Badge variant="outline">{t('hidden')}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(isMarine ? 'itemCountMarine' : 'itemCount', { count: type._count.items })}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Label className="mr-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={type.isActive}
                    onCheckedChange={(checked) => toggle(type, checked)}
                    aria-label={t('inUse', { name: type.name })}
                  />
                  {t('inUseShort')}
                </Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={t('moveUp', { name: type.name })}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === types.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={t('moveDown', { name: type.name })}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditing(type)}
                  aria-label={t('rename', { name: type.name })}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                {type._count.items === 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(type)}
                    aria-label={t('deleteNamed', { name: type.name })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-xs">
          <Label htmlFor="equipment-type-name">{t('name')}</Label>
          <Input
            id="equipment-type-name"
            value={name}
            maxLength={EQUIPMENT_TYPE_NAME_MAX}
            placeholder={t('namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" className="h-9" disabled={saving || !name.trim()}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('add')}
        </Button>
      </form>

      {editing && <RenameTypeDialog type={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function RenameTypeDialog({ type, onClose }: { type: EquipmentTypeRow; onClose: () => void }) {
  const t = useTranslations('equipment.types')
  const tc = useTranslations('common.buttons')
  const router = useRouter()
  const [name, setName] = useState(type.name)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const result = await updateEquipmentType({ id: type.id, name })
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
          <DialogTitle>{t('renameTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rename-equipment-type">{t('name')}</Label>
            <Input
              id="rename-equipment-type"
              value={name}
              maxLength={EQUIPMENT_TYPE_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('renameHint')}</p>
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
