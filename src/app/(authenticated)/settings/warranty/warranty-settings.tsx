'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppCard } from '@/components/app-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { readWarrantyDefaults } from '@/features/settings/Lib/warrantyDefaults'
import { WARRANTY_NONE, type WarrantyChoice } from '@/lib/warranty'
import { cn } from '@/lib/utils'
import { Loader2, Save, ShieldCheck } from 'lucide-react'
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from '../read-only-guard'

const CHOICES: WarrantyChoice[] = [WARRANTY_NONE, 'included', 'not_included']

/** Whole and positive, or empty: what the two number fields may hold. */
function wholeNumber(value: string): string {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? String(n) : ''
}

export function WarrantySettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter()
  const t = useTranslations('settings.warranty')
  const [saving, setSaving] = useState(false)

  const initial = readWarrantyDefaults(settings)
  const distUnit = settings[SETTING_KEYS.UNIT_SYSTEM] === 'metric' ? 'km' : 'mi'

  const [status, setStatus] = useState<WarrantyChoice>(initial.status ?? WARRANTY_NONE)
  const [months, setMonths] = useState(initial.defaultMonths ? String(initial.defaultMonths) : '')
  const [mileage, setMileage] = useState(
    initial.defaultMileage ? String(initial.defaultMileage) : ''
  )
  const [terms, setTerms] = useState(initial.includedTerms)
  const [notIncludedText, setNotIncludedText] = useState(initial.notIncludedText)
  const [applyToQuotes, setApplyToQuotes] = useState(initial.applyToQuotes)
  const [applyToWorkOrders, setApplyToWorkOrders] = useState(initial.applyToWorkOrders)

  const handleSave = async () => {
    setSaving(true)
    const result = await setSettings({
      [SETTING_KEYS.WARRANTY_DEFAULT_STATUS]: status,
      [SETTING_KEYS.WARRANTY_DEFAULT_MONTHS]: wholeNumber(months),
      [SETTING_KEYS.WARRANTY_DEFAULT_MILEAGE]: wholeNumber(mileage),
      [SETTING_KEYS.WARRANTY_DEFAULT_TERMS]: terms.trim(),
      [SETTING_KEYS.WARRANTY_NOT_INCLUDED_TEXT]: notIncludedText.trim(),
      [SETTING_KEYS.WARRANTY_APPLY_TO_QUOTES]: applyToQuotes ? 'true' : 'false',
      [SETTING_KEYS.WARRANTY_APPLY_TO_WORK_ORDERS]: applyToWorkOrders ? 'true' : 'false',
    })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || t('saveFailed'))
      return
    }
    router.refresh()
    toast.success(t('saved'))
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <AppCard icon={ShieldCheck} title={t('title')} contentClassName="space-y-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t('description')}</p>
            <p className="text-xs text-muted-foreground">{t('designHint')}</p>
          </div>

          <div className="space-y-2">
            <Label id="warranty-default-status">{t('defaultStatus')}</Label>
            <div
              role="radiogroup"
              aria-labelledby="warranty-default-status"
              className="grid max-w-xl grid-cols-3 gap-1 rounded-md bg-muted p-1"
            >
              {CHOICES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={status === option}
                  onClick={() => setStatus(option)}
                  className={cn(
                    'rounded px-2 py-1.5 text-sm font-medium transition-colors',
                    status === option
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(`status.${option}`)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t(`statusHint.${status}`)}</p>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">{t('includedTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('includedHint')}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="warrantyDefaultMonths">{t('months')}</Label>
                <Input
                  id="warrantyDefaultMonths"
                  type="number"
                  min={0}
                  placeholder="12"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warrantyDefaultMileage">{t('mileage', { unit: distUnit })}</Label>
                <Input
                  id="warrantyDefaultMileage"
                  type="number"
                  min={0}
                  placeholder="20000"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('mileageHint')}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="warrantyDefaultTerms">{t('terms')}</Label>
              <Textarea
                id="warrantyDefaultTerms"
                className="min-h-[90px]"
                placeholder={t('termsPlaceholder')}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('termsHint')}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">{t('notIncludedTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('notIncludedHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="warrantyNotIncludedText">{t('notIncludedText')}</Label>
              <Textarea
                id="warrantyNotIncludedText"
                className="min-h-[90px]"
                placeholder={t('notIncludedPlaceholder')}
                value={notIncludedText}
                onChange={(e) => setNotIncludedText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('legalHint')}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t('applyTitle')}</h3>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="warrantyApplyToQuotes">{t('applyToQuotes')}</Label>
                <p className="text-xs text-muted-foreground">{t('applyToQuotesHint')}</p>
              </div>
              <Switch
                id="warrantyApplyToQuotes"
                checked={applyToQuotes}
                onCheckedChange={setApplyToQuotes}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="warrantyApplyToWorkOrders">{t('applyToWorkOrders')}</Label>
                <p className="text-xs text-muted-foreground">{t('applyToWorkOrdersHint')}</p>
              </div>
              <Switch
                id="warrantyApplyToWorkOrders"
                checked={applyToWorkOrders}
                onCheckedChange={setApplyToWorkOrders}
              />
            </div>
          </div>

          <SaveButton>
            <Separator />
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('save')}
              </Button>
            </div>
          </SaveButton>
        </AppCard>
      </ReadOnlyWrapper>
    </div>
  )
}
