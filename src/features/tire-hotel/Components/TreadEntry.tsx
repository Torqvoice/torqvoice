'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  CONDITION_TOKENS,
  gradeTread,
  mmToThirtySeconds,
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
  previous,
}: {
  rows: TreadRow[]
  onChange: (rows: TreadRow[]) => void
  imperial: boolean
  season: string
  thresholds?: { summerReplace: number; winterReplace: number; warnMargin: number }
  /**
   * Last season's reading per position, in millimetres.
   *
   * Shown while the technician types this season's, because the wear is the
   * number worth knowing and nobody can work it out from two figures on two
   * different screens. Only a set the shop has held before has one.
   */
  previous?: Record<string, number | null>
}) {
  const t = useTranslations('tireHotel')

  const update = (index: number, patch: Partial<TreadRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  /** In the workshop's own unit, since that is what is being typed above it. */
  const display = (mm: number) =>
    imperial ? `${Math.round(mmToThirtySeconds(mm))}/32"` : `${Math.round(mm * 10) / 10} mm`

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
        const before = previous?.[row.position]
        const entered = Number(row.tread)
        const enteredMm =
          row.tread.trim() !== '' && Number.isFinite(entered)
            ? imperial
              ? thirtySecondsToMm(entered)
              : entered
            : null
        // Only wear is worth reporting. A reading that came out higher than
        // last season is a mistyped number or a replaced tire, and dressing
        // that up as negative wear would be nonsense.
        const worn =
          typeof before === 'number' && enteredMm !== null && before > enteredMm
            ? Math.round((before - enteredMm) * 10) / 10
            : null

        return (
          <div key={row.position} className="rounded-lg border p-2">
            <div className="flex items-center gap-2">
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

            {typeof before === 'number' && (
              <p className="mt-1 pl-[5.5rem] text-[11px] text-muted-foreground">
                {t('tread.lastTime', { value: display(before) })}
                {worn !== null && (
                  <span className="ml-1.5 text-amber-600">
                    {t('tread.worn', { value: display(worn) })}
                  </span>
                )}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
