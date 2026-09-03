'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ClipboardCheck, Loader2, Save } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { ReadOnlyBanner, ReadOnlyWrapper } from '../read-only-guard'

const MIN_LINK_DAYS = 7

/**
 * How reminders book: how long an inspection takes, how soon and how far
 * ahead a customer may book, how much room to keep for walk-ins, and how
 * long a link stays open. Kept out of the campaign page so it is decided
 * once, calmly, rather than at send time.
 */
export function InspectionReminderSettings({
  settings,
  timeZone,
  timeZoneDetected,
}: {
  settings: Record<string, string>
  /** The zone the server reads opening hours and booking times in. */
  timeZone: string
  /** True when it came from a browser rather than a choice under Localization. */
  timeZoneDetected: boolean
}) {
  const router = useRouter()
  const t = useTranslations('settings.inspectionReminders')
  const [saving, setSaving] = useState(false)
  const [duration, setDuration] = useState(
    settings[SETTING_KEYS.INSPECTION_DURATION_MINUTES] || '60'
  )
  const [leadDays, setLeadDays] = useState(
    settings[SETTING_KEYS.INSPECTION_BOOKING_LEAD_DAYS] || '1'
  )
  const [horizon, setHorizon] = useState(
    settings[SETTING_KEYS.INSPECTION_BOOKING_HORIZON_WEEKS] || '4'
  )
  const [reserve, setReserve] = useState(settings[SETTING_KEYS.INSPECTION_BOOKING_RESERVE] || '0')
  const [linkDays, setLinkDays] = useState(settings[SETTING_KEYS.INSPECTION_LINK_VALID_DAYS] || '7')
  const [mode, setMode] = useState(settings[SETTING_KEYS.INSPECTION_BOOKING_MODE] || 'direct')
  const [phone, setPhone] = useState(settings[SETTING_KEYS.INSPECTION_CONTACT_PHONE] || '')

  const clamp = (v: string, min: number) => String(Math.max(min, Math.floor(Number(v) || min)))

  const handleSave = async () => {
    setSaving(true)
    const result = await setSettings({
      [SETTING_KEYS.INSPECTION_DURATION_MINUTES]: clamp(duration, 15),
      [SETTING_KEYS.INSPECTION_BOOKING_LEAD_DAYS]: clamp(leadDays, 1),
      [SETTING_KEYS.INSPECTION_BOOKING_HORIZON_WEEKS]: clamp(horizon, 1),
      [SETTING_KEYS.INSPECTION_BOOKING_RESERVE]: clamp(reserve, 0),
      [SETTING_KEYS.INSPECTION_LINK_VALID_DAYS]: clamp(linkDays, MIN_LINK_DAYS),
      [SETTING_KEYS.INSPECTION_BOOKING_MODE]: mode,
      [SETTING_KEYS.INSPECTION_CONTACT_PHONE]: phone.trim(),
    })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error ?? t('saveFailed'))
      return
    }
    router.refresh()
    toast.success(t('saved'))
  }

  const field = (
    id: string,
    label: string,
    hint: string,
    value: string,
    onChange: (v: string) => void,
    min: number
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[10rem]"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <AppCard icon={ClipboardCheck} title={t('title')} contentClassName="space-y-6">
          <p className="text-sm text-muted-foreground">{t('description')}</p>

          <div
            className={`rounded-lg border px-3 py-2 text-sm ${timeZoneDetected ? 'border-amber-500/40 bg-amber-500/10' : 'bg-muted/30'}`}
          >
            <p>
              {timeZoneDetected
                ? t('timeZoneDetected', { zone: timeZone })
                : t('timeZoneExplicit', { zone: timeZone })}{' '}
              <Link href="/settings/localization" className="underline underline-offset-4">
                {t('timeZoneChange')}
              </Link>
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {field('ir-duration', t('duration'), t('durationHint'), duration, setDuration, 15)}
            {field('ir-lead', t('leadDays'), t('leadDaysHint'), leadDays, setLeadDays, 1)}
            {field('ir-horizon', t('horizonWeeks'), t('horizonHint'), horizon, setHorizon, 1)}
            {field('ir-reserve', t('reserve'), t('reserveHint'), reserve, setReserve, 0)}
            {field(
              'ir-link',
              t('linkValidDays'),
              t('linkValidHint', { min: MIN_LINK_DAYS }),
              linkDays,
              setLinkDays,
              MIN_LINK_DAYS
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ir-mode">{t('bookingMode')}</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger id="ir-mode" className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">{t('bookingModeDirect')}</SelectItem>
                  <SelectItem value="request">{t('bookingModeRequest')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('bookingModeHint')}</p>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="ir-phone">{t('phone')}</Label>
              <Input
                id="ir-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={settings[SETTING_KEYS.WORKSHOP_PHONE] || '+47 …'}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">{t('phoneHint')}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('save')}
            </Button>
          </div>
        </AppCard>
      </ReadOnlyWrapper>
    </div>
  )
}
