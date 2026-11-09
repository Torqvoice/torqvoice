'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Clock, Copy, Loader2 } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { saveOpeningHours } from '../Actions/holidayActions'
import { type WeekHours, minutesOf } from '../Lib/calendar'
import { weekdayName } from '../Lib/format'

/** Monday first, Sunday last, as a working week reads. */
const ORDER = [1, 2, 3, 4, 5, 6, 0]

/** When the workshop is open on each day of the week. */
export function OpeningHoursCard({ week, canEdit }: { week: WeekHours; canEdit: boolean }) {
  const t = useTranslations('workshopCalendar.hours')
  const locale = useLocale()
  const router = useRouter()
  const [days, setDays] = useState<WeekHours>(week)
  const [saving, setSaving] = useState(false)

  const set = (weekday: number, patch: Partial<WeekHours[number]>) =>
    setDays((prev) => prev.map((d, i) => (i === weekday ? { ...d, ...patch } : d)))

  const invalid = ORDER.filter(
    (weekday) =>
      days[weekday].open && minutesOf(days[weekday].start) >= minutesOf(days[weekday].end)
  )

  const save = async () => {
    if (invalid.length > 0) {
      toast.error(t('invalid', { day: weekdayName(invalid[0], locale) }))
      return
    }
    setSaving(true)
    const res = await saveOpeningHours(days)
    setSaving(false)
    if (!res.success) {
      toast.error(res.error ?? t('invalid', { day: '' }))
      return
    }
    toast.success(t('saved'))
    router.refresh()
  }

  const copyMonday = () =>
    setDays((prev) => prev.map((d, i) => (i >= 2 && i <= 5 ? { ...prev[1] } : d)))

  return (
    <AppCard
      id="opening-hours"
      icon={Clock}
      title={t('title')}
      description={t('description')}
      contentClassName="space-y-4"
    >
      <div className="divide-y rounded-md border">
        {ORDER.map((weekday) => {
          const day = days[weekday]
          const name = weekdayName(weekday, locale)
          const bad = invalid.includes(weekday)
          return (
            <div
              key={weekday}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-[10rem_auto_1fr]"
              data-testid={`opening-hours-${weekday}`}
            >
              <span className="text-sm font-medium capitalize">{name}</span>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  checked={day.open}
                  disabled={!canEdit}
                  onCheckedChange={(open) => set(weekday, { open })}
                  aria-label={`${name}: ${day.open ? t('open') : t('closed')}`}
                />
                <span className="w-16">{day.open ? t('open') : t('closed')}</span>
              </label>
              {day.open && (
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                  <Input
                    type="time"
                    value={day.start}
                    disabled={!canEdit}
                    aria-label={`${name}: ${t('opens')}`}
                    aria-invalid={bad}
                    className="w-32"
                    onChange={(e) => set(weekday, { start: e.target.value })}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="time"
                    value={day.end}
                    disabled={!canEdit}
                    aria-label={`${name}: ${t('closes')}`}
                    aria-invalid={bad}
                    className="w-32"
                    onChange={(e) => set(weekday, { end: e.target.value })}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {days.every((d) => !d.open) && (
        <p className="text-sm text-amber-700 dark:text-amber-400">{t('allClosed')}</p>
      )}

      {canEdit && (
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" size="sm" onClick={copyMonday}>
            <Copy className="mr-1 h-4 w-4" />
            {t('copyMonday')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('save')}
          </Button>
        </div>
      )}
    </AppCard>
  )
}
