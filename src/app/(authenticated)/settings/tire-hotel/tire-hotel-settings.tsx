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
import { DocsLink } from '@/components/docs-link'
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from '../read-only-guard'
import { mmToThirtySeconds, thirtySecondsToMm } from '@/features/tire-hotel/Lib/tireConstants'
import {
  TREATMENT_TYPES,
  parseTreatmentPrices,
  serializeTreatmentPrices,
  type TreatmentPrices,
} from '@/features/tire-hotel/Lib/treatments'

/**
 * Tire hotel is off until a workshop switches it on, because most shops that
 * do not store tires would only ever see it as clutter. Turning it on adds the
 * sidebar entry and unlocks the routes; turning it off hides them again
 * without touching any stored data.
 */
export function TireHotelSettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter()
  const t = useTranslations('settings')
  const tTire = useTranslations('tireHotel')
  const [saving, setSaving] = useState(false)

  const imperial = settings[SETTING_KEYS.UNIT_SYSTEM] === 'imperial'

  const [enabled, setEnabled] = useState(settings[SETTING_KEYS.TIRE_HOTEL_ENABLED] === 'true')
  const [defaultCapacity, setDefaultCapacity] = useState(
    settings[SETTING_KEYS.TIRE_HOTEL_DEFAULT_CAPACITY] || '8'
  )
  const [warnPercent, setWarnPercent] = useState(
    settings[SETTING_KEYS.TIRE_HOTEL_CAPACITY_WARN_PERCENT] || '90'
  )
  const [seasonalPrice, setSeasonalPrice] = useState(
    settings[SETTING_KEYS.TIRE_HOTEL_DEFAULT_SEASONAL_PRICE] || '0'
  )
  const [monthlyPrice, setMonthlyPrice] = useState(
    settings[SETTING_KEYS.TIRE_HOTEL_DEFAULT_MONTHLY_PRICE] || '0'
  )
  // Kept as typed text rather than numbers so a half-entered price does not
  // snap back to 0 between keystrokes.
  const [treatmentPrices, setTreatmentPrices] = useState<Record<string, string>>(() => {
    const parsed = parseTreatmentPrices(settings[SETTING_KEYS.TIRE_HOTEL_TREATMENT_PRICES])
    return Object.fromEntries(
      TREATMENT_TYPES.map((type) => [type, parsed[type] ? String(parsed[type]) : ''])
    )
  })

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
      [SETTING_KEYS.TIRE_HOTEL_DEFAULT_SEASONAL_PRICE]: String(
        Math.max(0, Number(seasonalPrice) || 0)
      ),
      [SETTING_KEYS.TIRE_HOTEL_DEFAULT_MONTHLY_PRICE]: String(
        Math.max(0, Number(monthlyPrice) || 0)
      ),
      [SETTING_KEYS.TIRE_HOTEL_TREATMENT_PRICES]: serializeTreatmentPrices(
        Object.fromEntries(
          Object.entries(treatmentPrices).map(([type, value]) => [type, Number(value) || 0])
        ) as TreatmentPrices
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
        {/* These defaults decide what every set is priced and graded against,
            and the manual is where the reasoning behind them lives. */}
        <DocsLink href="/docs/features/tire-hotel" variant="hint" className="mt-1" />
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

              <Separator />

              <div>
                <p className="text-sm font-medium">{t('tireHotel.billingTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('tireHotel.billingHint')}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tireHotelSeasonal">{t('tireHotel.seasonalPrice')}</Label>
                  <Input
                    id="tireHotelSeasonal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={seasonalPrice}
                    onChange={(e) => setSeasonalPrice(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tireHotelMonthly">{t('tireHotel.monthlyPrice')}</Label>
                  <Input
                    id="tireHotelMonthly"
                    type="number"
                    min="0"
                    step="0.01"
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium">{t('tireHotel.prepTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('tireHotel.prepHint')}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {TREATMENT_TYPES.map((type) => (
                  <div key={type} className="flex items-center gap-3">
                    <Label htmlFor={`prep-${type}`} className="min-w-0 flex-1 truncate font-normal">
                      {tTire(`treatments.types.${type}`)}
                    </Label>
                    <Input
                      id={`prep-${type}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={treatmentPrices[type] ?? ''}
                      onChange={(e) =>
                        setTreatmentPrices((prev) => ({ ...prev, [type]: e.target.value }))
                      }
                      // Empty rather than 0, so "not charged" and "free" are
                      // not the same keystroke.
                      placeholder={t('tireHotel.prepNotCharged')}
                      className="w-32 tabular-nums"
                    />
                  </div>
                ))}
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
