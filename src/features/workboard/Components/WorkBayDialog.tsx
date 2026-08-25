'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirm } from '@/components/confirm-dialog'
import { toast } from 'sonner'
import type { WorkBay } from '../Actions/boardActions'
import { createWorkBay, deleteWorkBay, updateWorkBay } from '../Actions/workBayActions'
import { useWorkBoardStore } from '../store/workboardStore'
import { formatDuration } from './DurationSlider'

const PRESET_COLORS = [
  '#64748b',
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]

const DEFAULT_CAPACITY = 480

export function WorkBayDialog({
  open,
  onOpenChange,
  workBay,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workBay?: WorkBay | null
}) {
  const t = useTranslations('workBoard.bay')
  const tc = useTranslations('common.buttons')
  const confirm = useConfirm()
  const store = useWorkBoardStore()

  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(workBay?.name ?? '')
    setColor(workBay?.color ?? PRESET_COLORS[0])
    setCapacity(workBay?.dailyCapacity ?? DEFAULT_CAPACITY)
  }, [open, workBay])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)

    const res = workBay
      ? await updateWorkBay({
          id: workBay.id,
          name: name.trim(),
          color,
          dailyCapacity: capacity,
        })
      : await createWorkBay({ name: name.trim(), color, dailyCapacity: capacity })

    if (res.success && res.data) {
      store.upsertWorkBay(res.data as WorkBay)
      onOpenChange(false)
    } else {
      toast.error(res.error ?? t('saveFailed'))
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{workBay ? t('editTitle') : t('addTitle')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bay-name">{t('name')}</Label>
            <Input
              id="bay-name"
              placeholder={t('namePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{t('color')}</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={preset}
                  onClick={() => setColor(preset)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: preset,
                    borderColor: color === preset ? 'currentColor' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bay-capacity">{t('dailyCapacity')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="bay-capacity"
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={capacity / 60}
                onChange={(event) => {
                  const hours = Number(event.target.value)
                  if (!Number.isFinite(hours)) return
                  setCapacity(Math.round(Math.min(Math.max(hours, 1), 24) * 60))
                }}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                {t('hoursPerDay')} · {formatDuration(capacity)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t('capacityHint')}</p>
          </div>

          <div className="flex justify-between gap-2">
            {workBay ? (
              <Button
                type="button"
                variant="destructive"
                disabled={deleting || saving}
                onClick={async () => {
                  const ok = await confirm({
                    title: t('deleteTitle'),
                    description: t('deleteDescription', { name: workBay.name }),
                    confirmLabel: tc('delete'),
                    destructive: true,
                  })
                  if (!ok) return
                  setDeleting(true)
                  const res = await deleteWorkBay({ id: workBay.id })
                  if (res.success) {
                    store.removeWorkBay(workBay.id)
                    onOpenChange(false)
                  } else {
                    toast.error(res.error ?? t('saveFailed'))
                  }
                  setDeleting(false)
                }}
              >
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tc('delete')}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {workBay ? tc('save') : t('addBay')}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
