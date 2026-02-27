'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/theme-provider'
import { Calendar, Clock, Loader2, Moon, Palette, Save, Sun } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { formatDate, formatDateTime, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { toast } from 'sonner'

const DATE_FORMAT_OPTIONS = [
  { value: "MMM d, yyyy", label: "MMM D, YYYY", example: "Feb 15, 2026" },
  { value: "dd/MM/yyyy", label: "DD/MM/YYYY", example: "15/02/2026" },
  { value: "MM/dd/yyyy", label: "MM/DD/YYYY", example: "02/15/2026" },
  { value: "yyyy-MM-dd", label: "YYYY-MM-DD", example: "2026-02-15" },
  { value: "d. MMM yyyy", label: "D. MMM YYYY", example: "15. Feb 2026" },
  { value: "d MMMM yyyy", label: "D MMMM YYYY", example: "15 February 2026" },
];

const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Warsaw",
  "Europe/Prague",
  "Europe/Budapest",
  "Europe/Bucharest",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Africa/Lagos",
];

export function AppearanceSettings({ settings }: { settings: Record<string, string> }) {
  const t = useTranslations('settings')
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const [dateFormat, setDateFormat] = useState(settings[SETTING_KEYS.DATE_FORMAT] || DEFAULT_DATE_FORMAT)
  const [timeFormat, setTimeFormat] = useState(settings[SETTING_KEYS.TIME_FORMAT] || "12h")
  const [timezone, setTimezone] = useState(settings[SETTING_KEYS.TIMEZONE] || "")

  const handleSave = async () => {
    setSaving(true)
    await setSettings({
      [SETTING_KEYS.DATE_FORMAT]: dateFormat,
      [SETTING_KEYS.TIME_FORMAT]: timeFormat,
      [SETTING_KEYS.TIMEZONE]: timezone,
    })
    setSaving(false)
    router.refresh()
    toast.success(t('appearance.saved'))
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Palette className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('appearance.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t('appearance.description')}</p>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <Label className="text-sm font-medium">{t('appearance.darkMode')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('appearance.darkModeHint')}
                </p>
              </div>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('appearance.dateTimeTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {t('appearance.dateTimeDescription')}
          </p>

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
            <Select value={timezone || "__auto__"} onValueChange={(v) => setTimezone(v === "__auto__" ? "" : v)}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">{t('appearance.timezoneAuto')}</SelectItem>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('appearance.timezoneHint')}
            </p>
          </div>

          <div className="rounded-lg border p-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{t('appearance.previewLabel')}</span>
            </div>
            <p>{t('appearance.dateLabel')}: <span className="font-medium text-foreground">{formatDate(new Date(), dateFormat, timezone || undefined)}</span></p>
            <p>{t('appearance.dateTimeLabel')}: <span className="font-medium text-foreground">{formatDateTime(new Date(), dateFormat, timeFormat as "12h" | "24h", timezone || undefined)}</span></p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('appearance.saveSettings')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
