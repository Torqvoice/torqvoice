'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CalendarOff, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-dialog'
import { deleteClosure, type ClosureView } from '../Actions/closureActions'
import { ClosureDialog } from './ClosureDialog'
import { useStretchLabel } from './useStretchLabel'

/** The workshop's own closed days: shutdowns, staff days, early closing. */
export function ClosedDaysCard({
  closures,
  today,
  canEdit,
}: {
  closures: ClosureView[]
  today: string
  canEdit: boolean
}) {
  const t = useTranslations('workshopCalendar.closures')
  const tc = useTranslations('common')
  const router = useRouter()
  const confirm = useConfirm()
  const label = useStretchLabel({ weekday: true })
  const [editing, setEditing] = useState<ClosureView | null>(null)
  const [open, setOpen] = useState(false)
  const [showPast, setShowPast] = useState(false)

  // A yearly closure is never past: it comes round again.
  const isPast = (c: ClosureView) => !c.repeatsYearly && c.endDate < today
  const past = closures.filter(isPast)
  const shown = showPast ? closures : closures.filter((c) => !isPast(c))

  const remove = async (closure: ClosureView) => {
    const ok = await confirm({
      title: t('deleteTitle', { name: closure.name }),
      description: t('deleteDescription'),
      confirmLabel: tc('buttons.delete'),
      destructive: true,
    })
    if (!ok) return
    const res = await deleteClosure(closure.id)
    if (!res.success) {
      toast.error(res.error ?? tc('errors.unexpected'))
      return
    }
    toast.success(t('deleted'))
    router.refresh()
  }

  return (
    <AppCard
      id="closed-days"
      icon={CalendarOff}
      title={t('title')}
      description={t('description')}
      contentClassName="space-y-3"
    >
      {canEdit && (
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t('add')}
        </Button>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {shown.map((closure) => (
            <li
              key={closure.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
              data-testid="closure-row"
            >
              <span className="font-medium">{closure.name}</span>
              <span className="text-muted-foreground">{label(closure)}</span>
              {closure.repeatsYearly && (
                <Badge variant="secondary" className="gap-1">
                  <Repeat className="h-3 w-3" />
                  {t('yearly')}
                </Badge>
              )}
              {canEdit && (
                <span className="ml-auto flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={t('edit')}
                    title={t('edit')}
                    onClick={() => {
                      setEditing(closure)
                      setOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    aria-label={tc('buttons.delete')}
                    title={tc('buttons.delete')}
                    onClick={() => remove(closure)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <Button variant="link" size="sm" className="px-0" onClick={() => setShowPast((v) => !v)}>
          {showPast ? t('hidePast') : t('past')}
        </Button>
      )}

      <ClosureDialog
        open={open}
        onOpenChange={setOpen}
        closure={editing}
        defaultDate={today}
        onSaved={() => router.refresh()}
      />
    </AppCard>
  )
}
