'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Shield, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useFormatDate } from '@/lib/use-format-date'

interface WarrantySectionProps {
  warrantyMonths: number | null
  warrantyMileage: number | null
  warrantyNotes: string | null
  serviceDate: string | null
  onWarrantyMonthsChange: (v: number | null) => void
  onWarrantyMileageChange: (v: number | null) => void
  onWarrantyNotesChange: (v: string | null) => void
}

const PRESETS = [3, 6, 12, 24] as const

export function WarrantySection({
  warrantyMonths,
  warrantyMileage,
  warrantyNotes,
  serviceDate,
  onWarrantyMonthsChange,
  onWarrantyMileageChange,
  onWarrantyNotesChange,
}: WarrantySectionProps) {
  const t = useTranslations('service.warranty')
  const { formatDate } = useFormatDate()

  const hasValues = !!(warrantyMonths || warrantyMileage || warrantyNotes)
  const [open, setOpen] = useState(hasValues)

  const expiresAt = useMemo(() => {
    if (!warrantyMonths || !serviceDate) return null
    const d = new Date(serviceDate)
    d.setMonth(d.getMonth() + warrantyMonths)
    return d
  }, [warrantyMonths, serviceDate])

  const handlePresetClick = (months: number) => {
    onWarrantyMonthsChange(warrantyMonths === months ? null : months)
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          {!open && hasValues && (
            <span className="text-xs text-muted-foreground">{warrantyMonths ? `${warrantyMonths} mo` : ''}</span>
          )}
        </button>
        {hasValues && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => {
              onWarrantyMonthsChange(null)
              onWarrantyMileageChange(null)
              onWarrantyNotesChange(null)
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Duration (months) */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('months')}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                className="h-8 w-24 text-sm"
                value={warrantyMonths ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  onWarrantyMonthsChange(v === '' ? null : Number(v))
                }}
              />
              <div className="flex gap-1">
                {PRESETS.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={warrantyMonths === m ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 rounded-full px-2.5 text-xs"
                    onClick={() => handlePresetClick(m)}
                  >
                    {t(`presets.${m}months` as 'presets.3months')}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Calculated expiration */}
          {expiresAt && (
            <div className="space-y-1">
              <Label className="text-xs">{t('expiresAt')}</Label>
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                {formatDate(expiresAt)}
              </p>
            </div>
          )}

          {/* Mileage limit */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('mileage')}</Label>
            <Input
              type="number"
              min={0}
              className="h-8 w-40 text-sm"
              value={warrantyMileage ?? ''}
              onChange={(e) => {
                const v = e.target.value
                onWarrantyMileageChange(v === '' ? null : Number(v))
              }}
            />
          </div>

          {/* Warranty terms */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('notes')}</Label>
            <Textarea
              className="min-h-[60px] text-sm"
              placeholder={t('notesPlaceholder')}
              value={warrantyNotes ?? ''}
              onChange={(e) => {
                const v = e.target.value
                onWarrantyNotesChange(v === '' ? null : v)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
