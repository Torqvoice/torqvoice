'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { setSetting, setSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { normalizeCountryCode } from '@/lib/portal-phone'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import {
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Coins,
  Globe,
  Loader2,
  Moon,
  Palette,
  Save,
  Sun,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate, formatDateTime, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { useTheme } from '@/components/theme-provider'
import { setLocale } from '@/i18n/actions'
import { locales, localeNames } from '@/i18n/config'
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from '../read-only-guard'

const CURRENCIES = [
  { code: 'USD', key: 'USD' },
  { code: 'EUR', key: 'EUR' },
  { code: 'GBP', key: 'GBP' },
  { code: 'NOK', key: 'NOK' },
  { code: 'SEK', key: 'SEK' },
  { code: 'DKK', key: 'DKK' },
  { code: 'CHF', key: 'CHF' },
  { code: 'CAD', key: 'CAD' },
  { code: 'AUD', key: 'AUD' },
  { code: 'NZD', key: 'NZD' },
  { code: 'JPY', key: 'JPY' },
  { code: 'CNY', key: 'CNY' },
  { code: 'INR', key: 'INR' },
  { code: 'BRL', key: 'BRL' },
  { code: 'MXN', key: 'MXN' },
  { code: 'PLN', key: 'PLN' },
  { code: 'CZK', key: 'CZK' },
  { code: 'HUF', key: 'HUF' },
  { code: 'TRY', key: 'TRY' },
  { code: 'ZAR', key: 'ZAR' },
  { code: 'KRW', key: 'KRW' },
  { code: 'SGD', key: 'SGD' },
  { code: 'HKD', key: 'HKD' },
  { code: 'THB', key: 'THB' },
  { code: 'ISK', key: 'ISK' },
  { code: 'RON', key: 'RON' },
  { code: 'ILS', key: 'ILS' },
  { code: 'PHP', key: 'PHP' },
  { code: 'IDR', key: 'IDR' },
  { code: 'MYR', key: 'MYR' },
  { code: 'AED', key: 'AED' },
  { code: 'SAR', key: 'SAR' },
  { code: 'RUB', key: 'RUB' },
]

const DATE_FORMAT_OPTIONS = [
  { value: 'MMM d, yyyy', label: 'MMM D, YYYY', example: 'Feb 15, 2026' },
  { value: 'dd/MM/yyyy', label: 'DD/MM/YYYY', example: '15/02/2026' },
  { value: 'MM/dd/yyyy', label: 'MM/DD/YYYY', example: '02/15/2026' },
  { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD', example: '2026-02-15' },
  { value: 'd. MMM yyyy', label: 'D. MMM YYYY', example: '15. Feb 2026' },
  { value: 'd MMMM yyyy', label: 'D MMMM YYYY', example: '15 February 2026' },
]

const TIMEZONE_OPTIONS = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Zurich',
  'Europe/Vienna',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Copenhagen',
  'Europe/Helsinki',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Budapest',
  'Europe/Bucharest',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Perth',
  'Pacific/Auckland',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Africa/Lagos',
]

export function LocalizationSettings({ settings }: { settings: Record<string, string> }) {
  const router = useRouter()
  const t = useTranslations('settings')
  const { theme, setTheme } = useTheme()
  const currentLocale = useLocale()
  const [saving, setSaving] = useState(false)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [timezoneOpen, setTimezoneOpen] = useState(false)

  // Currency
  const [currencyCode, setCurrencyCode] = useState(settings[SETTING_KEYS.CURRENCY_CODE] || 'USD')

  // Date & Time
  const [dateFormat, setDateFormat] = useState(
    settings[SETTING_KEYS.DATE_FORMAT] || DEFAULT_DATE_FORMAT
  )
  const [timeFormat, setTimeFormat] = useState(settings[SETTING_KEYS.TIME_FORMAT] || '12h')
  const [timezone, setTimezone] = useState(settings[SETTING_KEYS.TIMEZONE] || '')

  const [forceCustomerLocale, setForceCustomerLocale] = useState(
    settings[SETTING_KEYS.FORCE_CUSTOMER_LOCALE] === 'true'
  )

  // Default country code (E.164 prefix like "+47") used when normalizing
  // customer phone numbers in the portal SMS sign-in flow.
  const [defaultCountryCode, setDefaultCountryCode] = useState(
    settings[SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE] || ''
  )

  // The setting is invalid when the user has typed something but it can't
  // be normalized into a real country code (covers junk like "0", "00",
  // "abc", "12345", etc.). Empty string is allowed (means "no default").
  const trimmedCountryCode = defaultCountryCode.trim()
  const countryCodeInvalid =
    trimmedCountryCode !== '' && normalizeCountryCode(trimmedCountryCode) === null

  const handleCountryCodeBlur = () => {
    // Normalize on blur so the user sees the canonical "+47" form right
    // after typing things like "0047" or "47".
    const normalized = normalizeCountryCode(defaultCountryCode)
    if (normalized) setDefaultCountryCode(normalized)
  }

  // Theme (localStorage) and new Date() (runtime TZ) are client-only;
  // defer rendering until after hydration to avoid SSR/client mismatches.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSave = async () => {
    // Guard against invalid country codes — don't persist garbage that
    // would silently break the portal SMS flow.
    const normalizedCountryCode = trimmedCountryCode ? normalizeCountryCode(trimmedCountryCode) : ''
    if (trimmedCountryCode && normalizedCountryCode === null) {
      toast.error(t('localization.defaultCountryCodeInvalid'))
      return
    }

    setSaving(true)
    await setSettings({
      [SETTING_KEYS.CURRENCY_CODE]: currencyCode,
      [SETTING_KEYS.DATE_FORMAT]: dateFormat,
      [SETTING_KEYS.TIME_FORMAT]: timeFormat,
      [SETTING_KEYS.TIMEZONE]: timezone,
      [SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE]: normalizedCountryCode ?? '',
    })
    // Reflect the normalized form back in the input.
    if (normalizedCountryCode) setDefaultCountryCode(normalizedCountryCode)
    setSaving(false)
    router.refresh()
    toast.success(t('localization.saved'))
  }

  const handleLanguageChange = async (value: string) => {
    await Promise.all([setLocale(value), setSetting(SETTING_KEYS.WORKSHOP_LOCALE, value)])
    router.refresh()
  }

  const handleForceCustomerLocaleChange = async (value: boolean) => {
    setForceCustomerLocale(value)
    // Snapshot the admin's current locale so force mode always has a target,
    // even on existing installs where workshop.locale was never written.
    await setSettings({
      [SETTING_KEYS.FORCE_CUSTOMER_LOCALE]: String(value),
      [SETTING_KEYS.WORKSHOP_LOCALE]: currentLocale,
    })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      {/* Language */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('localization.languageTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('localization.languageDescription')}</p>
          <div className="space-y-2">
            <Label>{t('localization.language')}</Label>
            <Select value={currentLocale} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {localeNames[loc]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="pr-4">
              <Label>{t('localization.forceCustomerLocale')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('localization.forceCustomerLocaleHint')}
              </p>
            </div>
            <Switch
              checked={forceCustomerLocale}
              onCheckedChange={handleForceCustomerLocaleChange}
            />
          </div>

          <Separator />

          <ReadOnlyWrapper>
            <div className="space-y-2">
              <Label htmlFor="default-country-code">{t('localization.defaultCountryCode')}</Label>
              <Input
                id="default-country-code"
                value={defaultCountryCode}
                onChange={(e) => setDefaultCountryCode(e.target.value)}
                onBlur={handleCountryCodeBlur}
                placeholder="+47"
                inputMode="tel"
                aria-invalid={countryCodeInvalid || undefined}
                className={cn(
                  'w-32 font-mono',
                  countryCodeInvalid && 'border-destructive focus-visible:ring-destructive'
                )}
              />
              {countryCodeInvalid ? (
                <p className="text-xs text-destructive">
                  {t('localization.defaultCountryCodeInvalid')}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('localization.defaultCountryCodeHint')}
                </p>
              )}
            </div>
          </ReadOnlyWrapper>
        </CardContent>
      </Card>

      {/* Currency */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Coins className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('currency.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t('currency.description')}</p>

          <ReadOnlyWrapper>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>{t('currency.currencyLabel')}</Label>
                <Popover open={currencyOpen} onOpenChange={setCurrencyOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={currencyOpen}
                      className="w-64 justify-between font-normal"
                    >
                      {currencyCode} &mdash; {t('currency.currencies.' + currencyCode)}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t('currency.searchCurrency')} />
                      <CommandList>
                        <CommandEmpty>{t('currency.noCurrencyFound')}</CommandEmpty>
                        <CommandGroup>
                          {CURRENCIES.map((c) => (
                            <CommandItem
                              key={c.code}
                              value={`${c.code} ${t('currency.currencies.' + c.code)}`}
                              onSelect={() => {
                                setCurrencyCode(c.code)
                                setCurrencyOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  currencyCode === c.code ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              {c.code} &mdash; {t('currency.currencies.' + c.code)}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  {t('currency.previewLabel', { value: formatCurrency(1234.56, currencyCode) })}
                </p>
              </div>
            </div>
          </ReadOnlyWrapper>
        </CardContent>
      </Card>

      {/* Date & Time */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('appearance.dateTimeTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t('appearance.dateTimeDescription')}</p>

          <ReadOnlyWrapper>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>{t('appearance.dateFormat')}</Label>
                <Select value={dateFormat} onValueChange={setDateFormat}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMAT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label} ({opt.example})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('appearance.timeFormat')}</Label>
                <Select value={timeFormat} onValueChange={setTimeFormat}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12h">{t('appearance.time12h')}</SelectItem>
                    <SelectItem value="24h">{t('appearance.time24h')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('appearance.timezone')}</Label>
                <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={timezoneOpen}
                      className="w-72 justify-between font-normal"
                    >
                      {timezone ? timezone.replace(/_/g, ' ') : t('appearance.timezoneAuto')}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t('appearance.searchTimezone')} />
                      <CommandList>
                        <CommandEmpty>{t('appearance.noTimezoneFound')}</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value={t('appearance.timezoneAuto')}
                            onSelect={() => {
                              setTimezone('')
                              setTimezoneOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                !timezone ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {t('appearance.timezoneAuto')}
                          </CommandItem>
                          {TIMEZONE_OPTIONS.map((tz) => (
                            <CommandItem
                              key={tz}
                              value={tz.replace(/_/g, ' ')}
                              onSelect={() => {
                                setTimezone(tz)
                                setTimezoneOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  timezone === tz ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              {tz.replace(/_/g, ' ')}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">{t('appearance.timezoneHint')}</p>
              </div>

              <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">
                    {t('appearance.previewLabel')}
                  </span>
                </div>
                <p>
                  {t('appearance.dateLabel')}:{' '}
                  <span className="font-medium text-foreground">
                    {mounted ? formatDate(new Date(), dateFormat, timezone || undefined) : ''}
                  </span>
                </p>
                <p>
                  {t('appearance.dateTimeLabel')}:{' '}
                  <span className="font-medium text-foreground">
                    {mounted
                      ? formatDateTime(
                          new Date(),
                          dateFormat,
                          timeFormat as '12h' | '24h',
                          timezone || undefined
                        )
                      : ''}
                  </span>
                </p>
              </div>
            </div>
          </ReadOnlyWrapper>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Palette className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('appearance.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              {mounted && theme === 'dark' ? (
                <Moon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <Label className="text-sm font-medium">{t('appearance.darkMode')}</Label>
                <p className="text-xs text-muted-foreground">{t('appearance.darkModeHint')}</p>
              </div>
            </div>
            <Switch
              checked={mounted && theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <SaveButton>
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t('localization.saveSettings')}
          </Button>
        </div>
      </SaveButton>
    </div>
  )
}
