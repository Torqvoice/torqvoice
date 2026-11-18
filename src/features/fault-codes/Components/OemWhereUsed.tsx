'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { modelLines } from '../Lib/oem'
import type { OemMeaningView } from '../Lib/types'

const UNITS_SHOWN = 6

/**
 * Where a make uses one meaning of its code: the models and years, the
 * engines and the control units that give it. On the code's page it fills a
 * card; beside a job it reads as one more part.
 */
export function OemWhereUsed({
  meaning,
  layout,
}: {
  meaning: OemMeaningView
  layout: 'page' | 'sheet'
}) {
  const t = useTranslations('faultCodes.oem')
  const [allUnits, setAllUnits] = useState(false)
  const { lines, other } = modelLines(meaning.vehicles)
  const units = allUnits ? meaning.modules : meaning.modules.slice(0, UNITS_SHOWN)
  const page = layout === 'page'
  const heading = page
    ? 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
    : 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'

  return (
    <div className={page ? 'space-y-4' : 'space-y-3'}>
      {(lines.length > 0 || other.length > 0) && (
        <section className="space-y-1.5">
          <h4 className={heading}>{t('models')}</h4>
          <ul className="space-y-1 text-sm">
            {lines.map((line) => (
              <li key={line.model} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{line.model}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {line.chassis.join(', ')}
                </span>
                {line.from !== null && (
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {line.to === null
                      ? t('yearsFrom', { from: line.from })
                      : t('years', { from: line.from, to: line.to })}
                  </span>
                )}
              </li>
            ))}
            {other.length > 0 && (
              <li className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{t('otherChassis')}</span>
                <span className="font-mono text-xs text-muted-foreground">{other.join(', ')}</span>
              </li>
            )}
          </ul>
        </section>
      )}
      {meaning.engines.length > 0 && (
        <section className="space-y-1.5">
          <h4 className={heading}>{t('engineList')}</h4>
          <div className="flex flex-wrap gap-1.5">
            {meaning.engines.map((engine) => (
              <span
                key={engine}
                className="rounded-md border border-card-edge bg-muted/40 px-1.5 py-0.5 font-mono text-xs"
              >
                {engine}
              </span>
            ))}
          </div>
        </section>
      )}
      <section className="space-y-1.5">
        <h4 className={heading}>{t('units')}</h4>
        <div className="flex flex-wrap items-center gap-1.5">
          {units.map((u) => (
            <span
              key={u.ref}
              title={u.name ?? undefined}
              className="rounded-md border border-card-edge bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]"
            >
              {u.family ? `${u.family} · ${u.ref}` : u.ref}
            </span>
          ))}
          {meaning.modules.length > UNITS_SHOWN && (
            <button
              type="button"
              onClick={() => setAllUnits((v) => !v)}
              className="cursor-pointer text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {allUnits
                ? t('fewerUnits')
                : t('moreUnits', { count: meaning.modules.length - UNITS_SHOWN })}
            </button>
          )}
        </div>
      </section>
      <p className="text-xs text-muted-foreground">{t('source')}</p>
    </div>
  )
}
