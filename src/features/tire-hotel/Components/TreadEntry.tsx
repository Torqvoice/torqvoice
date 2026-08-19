'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  CONDITION_TOKENS,
  gradeTread,
  thirtySecondsToMm,
  type TireCondition,
  type TirePosition,
} from '../Lib/tireConstants'

export type TreadRow = {
  position: TirePosition
  /** As typed, in the workshop's display unit. Converted on submit. */
  tread: string
  condition: TireCondition
}

/**
 * Four tread readings in a row, graded as they are typed.
 *
 * The grade is suggested rather than imposed: the number decides the colour,
 * but a technician who sees sidewall damage on an otherwise deep tire can
 * still mark it. Legal minimums differ by country, so the thresholds come from
 * the workshop's own settings rather than a built-in rule.
 */
export function TreadEntry({
  rows,
  onChange,
  imperial,
  season,
  thresholds,
}: {
  rows: TreadRow[]
  onChange: (rows: TreadRow[]) => void
  imperial: boolean
  season: string
  thresholds?: { summerReplace: number; winterReplace: number; warnMargin: number }
}) {
  const t = useTranslations('tireHotel')

  const update = (index: number, patch: Partial<TreadRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const gradeFor = (value: string): TireCondition | null => {
    const entered = Number(value)
    if (value.trim() === '' || !Number.isFinite(entered)) return null
    const mm = imperial ? thirtySecondsToMm(entered) : entered
    return gradeTread(mm, season, thresholds)
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((row, index) => {
        const suggested = gradeFor(row.tread)
        const active = suggested ?? row.condition
        return (
          <div key={row.position} className="flex items-center gap-2 rounded-lg border p-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">
              {t(`positions.${row.position}`)}
            </span>
            <Input
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              value={row.tread}
              onChange={(e) => {
                const grade = gradeFor(e.target.value)
                update(index, {
                  tread: e.target.value,
                  ...(grade ? { condition: grade } : {}),
                })
              }}
              placeholder={imperial ? t('tread.placeholder32') : t('tread.placeholderMm')}
              className="h-8 flex-1 tabular-nums"
              aria-label={t('tread.inputLabel', { position: t(`positions.${row.position}`) })}
            />
            <Badge
              variant="outline"
              className={cn('shrink-0 text-[10px]', CONDITION_TOKENS[active].badge)}
            >
              {t(`conditions.${active}`)}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}
