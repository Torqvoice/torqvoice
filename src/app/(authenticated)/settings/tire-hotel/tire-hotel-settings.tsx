'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppCard } from '@/components/app-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { Loader2, Save, Warehouse } from 'lucide-react'
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from '../read-only-guard'
import { mmToThirtySeconds, thirtySecondsToMm } from '@/features/tire-hotel/Lib/tireConstants'

/**
 * Tire hotel is off until a workshop switches it on, because most shops that
 * do not store tires would only ever see it as clutter. Turning it on adds the
 * sidebar entry and unlocks the routes; turning it off hides them again
 * without touching any stored data.
 */
export function TireHotelSettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter()
  const t = useTranslations('settings')
  const [saving, setSaving] = useState(false)

  const imperial = settings[SETTING_KEYS.UNIT_SYSTEM] === 'imperial'

  const [enabled, setEnabled] = useState(settings[SETTING_KEYS.TIRE_HOTEL_ENABLED] === 'true')
  const [defaultCapacity, setDefaultCapacity] = useState(
    settings[SETTING_KEYS.TIRE_HOTEL_DEFAULT_CAPACITY] || '8'
  )
  const [warnPercent, setWarnPercent] = useState(
    settings[SETTING_KEYS.TIRE_HOTEL_CAPACITY_WARN_PERCENT] || '90'
  )

  // Thresholds are stored in mm. Workshops on imperial units type 32nds, so
  // the field converts on the way in and out and the stored number keeps one
  // meaning everywhere.
  const toDisplay = (mm: string, fallback: number) => {
    const value = Number(mm || fallback)
    return imperial ? mmToThirtySeconds(value).toFixed(1) : String(value)
  }
  const [summerLimit, setSummerLimit] = useState(
    toDisplay(settings[SETTING_KEYS.TIRE_HOTEL_SUMMER_REPLACE_MM], 1.6)
  )
  const [winterLimit, setWinterLimit] = useState(
    toDisplay(settings[SETTING_KEYS.TIRE_HOTEL_WINTER_REPLACE_MM], 4)
  )

  const toStored = (value: string, fallback: number) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return String(fallback)
    return String(imperial ? Number(thirtySecondsToMm(parsed).toFixed(2)) : parsed)
  }

  const handleSave = async () => {
    setSaving(true)
    await setSettings({
      [SETTING_KEYS.TIRE_HOTEL_ENABLED]: enabled ? 'true' : 'false',
      [SETTING_KEYS.TIRE_HOTEL_SUMMER_REPLACE_MM]: toStored(summerLimit, 1.6),
      [SETTING_KEYS.TIRE_HOTEL_WINTER_REPLACE_MM]: toStored(winterLimit, 4),
      [SETTING_KEYS.TIRE_HOTEL_DEFAULT_CAPACITY]: String(
        Math.max(0, Math.round(Number(defaultCapacity) || 8))
      ),
      [SETTING_KEYS.TIRE_HOTEL_CAPACITY_WARN_PERCENT]: String(
        Math.min(100, Math.max(1, Math.round(Number(warnPercent) || 90)))
      ),
    })
    setSaving(false)
    router.refresh()
    toast.success(t('tireHotel.saved'))
  }

  const unitLabel = imperial ? t('tireHotel.unit32nds') : t('tireHotel.unitMm')

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <h2 className="text-lg font-semibold">{t('tireHotel.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('tireHotel.description')}</p>
      </div>
      <ReadOnlyWrapper>
        <AppCard icon={Warehouse} title={t('tireHotel.cardTitle')} contentClassName="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="tireHotelEnabled">{t('tireHotel.enable')}</Label>
              <p className="text-xs text-muted-foreground">{t('tireHotel.enableHint')}</p>
            </div>
            <Switch id="tireHotelEnabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <>
              <Separator />

              <div className="space-y-2">
                <Label htmlFor="tireHotelCapacity">{t('tireHotel.defaultCapacity')}</Label>
                <Input
                  id="tireHotelCapacity"
                  type="number"
                  min="0"
                  max="10000"
                  value={defaultCapacity}
                  onChange={(e) => setDefaultCapacity(e.target.value)}
                  className="max-w-[160px]"
                />
                <p className="text-xs text-muted-foreground">
                  {t('tireHotel.defaultCapacityHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tireHotelWarn">{t('tireHotel.warnPercent')}</Label>
                <Input
                  id="tireHotelWarn"
                  type="number"
                  min="1"
                  max="100"
                  value={warnPercent}
                  onChange={(e) => setWarnPercent(e.target.value)}
                  className="max-w-[160px]"
                />
                <p className="text-xs text-muted-foreground">{t('tireHotel.warnPercentHint')}</p>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium">{t('tireHotel.treadTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('tireHotel.treadHint')}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tireHotelSummer">
                    {t('tireHotel.summerLimit', { unit: unitLabel })}
                  </Label>
                  <Input
                    id="tireHotelSummer"
                    type="number"
                    step="0.1"
                    min="0"
                    value={summerLimit}
                    onChange={(e) => setSummerLimit(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tireHotelWinter">
                    {t('tireHotel.winterLimit', { unit: unitLabel })}
                  </Label>
                  <Input
                    id="tireHotelWinter"
                    type="number"
                    step="0.1"
                    min="0"
                    value={winterLimit}
                    onChange={(e) => setWinterLimit(e.target.value)}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('tireHotel.setupHint')}{' '}
                <Link href="/tire-hotel/storage" className="text-primary hover:underline">
                  {t('tireHotel.setupLink')}
                </Link>
              </p>
            </>
          )}

          <SaveButton>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('tireHotel.save')}
            </Button>
          </SaveButton>
        </AppCard>
      </ReadOnlyWrapper>
    </div>
  )
}
