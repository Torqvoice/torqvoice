'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Shield } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import {
  switchWarrantyStatement,
  WARRANTY_NONE,
  type WarrantyChoice,
  type WarrantyFields,
  type WarrantyTexts,
} from '@/lib/warranty'

interface WarrantySectionProps {
  value: WarrantyFields
  onChange: (next: WarrantyFields) => void
  /** The workshop's stock texts and periods, filled in when the statement changes. */
  texts: WarrantyTexts
  /** 'km' or 'mi', as the workshop measures distance. */
  distanceUnit: string
  /**
   * The day the period runs from. A quote has none, so it shows no expiry:
   * the warranty starts with the work, which has not been booked yet.
   */
  serviceDate?: string | null
}

const PRESETS = [3, 6, 12, 24] as const
const CHOICES: WarrantyChoice[] = [WARRANTY_NONE, 'included', 'not_included']

/**
 * What the customer is told about the workshop's warranty, on a work order and
 * on a quote alike. Three answers rather than a filled or empty field, because
 * "we offer none" is something a customer is entitled to read before they
 * accept, and an empty field cannot say it.
 */
export function WarrantySection({
  value,
  onChange,
  texts,
  distanceUnit,
  serviceDate,
}: WarrantySectionProps) {
  const t = useTranslations('service.warranty')
  const { formatDate } = useFormatDate()

  const choice: WarrantyChoice = value.warrantyStatus ?? WARRANTY_NONE
  const [open, setOpen] = useState(value.warrantyStatus !== null)

  const expiresAt = useMemo(() => {
    if (value.warrantyStatus !== 'included' || !value.warrantyMonths || !serviceDate) return null
    const d = new Date(serviceDate)
    d.setMonth(d.getMonth() + value.warrantyMonths)
    return d
  }, [value.warrantyStatus, value.warrantyMonths, serviceDate])

  const choose = (next: WarrantyChoice) => {
    if (next === choice) return
    onChange(switchWarrantyStatement(value, next === WARRANTY_NONE ? null : next, texts))
  }

  const summary =
    value.warrantyStatus === 'not_included'
      ? t('statement.not_included')
      : value.warrantyStatus === 'included'
        ? [
            value.warrantyMonths ? t('summaryMonths', { count: value.warrantyMonths }) : null,
            value.warrantyMileage
              ? `${value.warrantyMileage.toLocaleString()} ${distanceUnit}`
              : null,
          ]
            .filter(Boolean)
            .join(' / ') || t('statement.included')
        : ''

  return (
    <div className="rounded-lg border p-3" data-testid="warranty-section">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        {!open && summary && (
          <span className="truncate text-xs text-muted-foreground" data-testid="warranty-summary">
            {summary}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div
            role="radiogroup"
            aria-label={t('statementLabel')}
            className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1"
          >
            {CHOICES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={choice === option}
                onClick={() => choose(option)}
                className={cn(
                  'rounded px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-60',
                  choice === option
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t(`statement.${option}`)}
              </button>
            ))}
          </div>

          {choice === WARRANTY_NONE && (
            <p className="text-xs text-muted-foreground">{t('noneHint')}</p>
          )}

          {choice === 'included' && (
            <>
              {/* Duration (months) */}
              <div className="space-y-1.5">
                <Label htmlFor="warrantyMonths" className="text-xs">
                  {t('months')}
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="warrantyMonths"
                    type="number"
                    min={0}
                    className="h-8 w-24 text-sm"
                    value={value.warrantyMonths ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      onChange({ ...value, warrantyMonths: v === '' ? null : Number(v) })
                    }}
                  />
                  <div className="flex gap-1">
                    {PRESETS.map((m) => (
                      <Button
                        key={m}
                        type="button"
                        variant={value.warrantyMonths === m ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 rounded-full px-2.5 text-xs"
                        onClick={() =>
                          onChange({
                            ...value,
                            warrantyMonths: value.warrantyMonths === m ? null : m,
                          })
                        }
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

              {/* Distance limit */}
              <div className="space-y-1.5">
                <Label htmlFor="warrantyMileage" className="text-xs">
                  {t('mileageWithUnit', { unit: distanceUnit })}
                </Label>
                <Input
                  id="warrantyMileage"
                  type="number"
                  min={0}
                  className="h-8 w-40 text-sm"
                  value={value.warrantyMileage ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    onChange({ ...value, warrantyMileage: v === '' ? null : Number(v) })
                  }}
                />
              </div>
            </>
          )}

          {choice !== WARRANTY_NONE && (
            <div className="space-y-1.5">
              <Label htmlFor="warrantyNotes" className="text-xs">
                {choice === 'included' ? t('notes') : t('notIncludedNotes')}
              </Label>
              <Textarea
                id="warrantyNotes"
                className="min-h-[60px] text-sm"
                placeholder={
                  choice === 'included' ? t('notesPlaceholder') : t('notIncludedPlaceholder')
                }
                value={value.warrantyNotes ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  onChange({ ...value, warrantyNotes: v === '' ? null : v })
                }}
              />
              <p className="text-xs text-muted-foreground">
                {choice === 'included' ? t('printedHint') : t('notIncludedHint')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
