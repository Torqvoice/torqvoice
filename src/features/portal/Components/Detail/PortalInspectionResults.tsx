import { getLocale, getTranslations } from 'next-intl/server'
import {
  CONDITION_TOKENS,
  countConditions,
  deriveTestResult,
  formatRange,
  gradedConditionLabel,
  isDefect,
  type Condition,
  type SeverityScale,
} from '@/features/inspections/Lib/conditions'
import { cn } from '@/lib/utils'
import { PortalPanel, PortalSectionLabel } from '../Ui'

interface ResultItem {
  id: string
  name: string
  section: string
  sectionCode: string | null
  code: string | null
  sortOrder: number
  condition: string
  notes: string | null
  inputType: string | null
  unit: string | null
  minValue: number | null
  maxValue: number | null
  measuredValue: number | null
  textValue: string | null
}

/**
 * An inspection's results as the shared report draws them: the verdict, what
 * needs work first, then every graded check grouped by section. The words
 * for grades and verdicts are the shared report's own (`share.inspection`),
 * so the customer reads the same thing in the portal as on the link.
 *
 * A grade keeps the colour it has everywhere in the app (CONDITION_TOKENS):
 * each is a filled chip with its own text colour, so it reads the same on a
 * light and on a dark portal theme. Everything around it is the theme's.
 */

/**
 * A measured value with its unit as it is written: "3.2 mm", "0.5 m⁻¹", but
 * "45%" and "12°", which take no space.
 */
export function withUnit(value: string, unit: string | null | undefined): string {
  const mark = unit?.trim()
  if (!mark) return value
  return /^[%°‰]/.test(mark) ? `${value}${mark}` : `${value} ${mark}`
}

export async function PortalInspectionResults({
  items,
  severityScale,
  country,
}: {
  items: ResultItem[]
  severityScale: string | null
  country: string | null
}) {
  const t = await getTranslations('share.inspection')
  const td = await getTranslations('portal.inspectionDetail')
  const locale = await getLocale()

  const scale: SeverityScale = severityScale === 'basic' ? 'basic' : 'eu'
  const conditionText = (condition: Condition) =>
    scale === 'basic' ? t(`basic.${condition}`) : t(`eu.${condition}`)
  const gradedText = (condition: Condition) =>
    gradedConditionLabel(condition, scale, country, conditionText(condition))

  // An ungraded check is not a result, so it is not shown as one.
  const graded = items
    .filter((item) => item.condition !== 'not_inspected')
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const sections: { name: string; code: string | null; items: ResultItem[] }[] = []
  for (const item of graded) {
    let section = sections.find((s) => s.name === item.section)
    if (!section) {
      section = { name: item.section, code: item.sectionCode, items: [] }
      sections.push(section)
    }
    section.items.push(item)
  }

  const counts = countConditions(graded)
  const result = deriveTestResult(graded)
  const defects = graded.filter((item) => isDefect(item.condition))
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 })

  const value = (item: ResultItem) => {
    if (item.inputType === 'measurement' && item.measuredValue != null) {
      const range = formatRange(item, { min: t('rangeMin'), max: t('rangeMax'), locale })
      return (
        <p className="mt-1 text-sm">
          <span className="font-semibold">
            {withUnit(number.format(item.measuredValue), item.unit)}
          </span>
          {range && (
            <span className="p-muted">
              {' '}
              &middot; {t('limit')}: {range}
            </span>
          )}
        </p>
      )
    }
    if (item.textValue) return <p className="mt-1 text-sm">{item.textValue}</p>
    return null
  }

  const grade = (condition: Condition) => (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-[var(--p-radius-badge)] border px-2.5 py-1 text-xs font-semibold',
        CONDITION_TOKENS[condition]?.soft
      )}
    >
      {gradedText(condition)}
    </span>
  )

  if (graded.length === 0) {
    return (
      <PortalPanel>
        <p className="p-muted text-[15px]">{td('noResults')}</p>
      </PortalPanel>
    )
  }

  return (
    <div className="space-y-6">
      <PortalPanel aria-labelledby="result-heading">
        <h2 id="result-heading" className="p-display text-[24px]">
          {t(scale === 'basic' ? `checkResult.${result}` : `result.${result}`)}
        </h2>
        <p className="p-muted mt-1.5 text-[15px]">
          {t(scale === 'basic' ? `checkResultDetail.${result}` : `resultDetail.${result}`)}
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <li>
            <span className="font-semibold">{counts.inspected}</span>{' '}
            <span className="p-muted">{t('inspected')}</span>
          </li>
          {(['pass', 'attention', 'fail', 'dangerous'] as const)
            .filter((c) => scale === 'eu' || c !== 'dangerous')
            .map((c) => (
              <li key={c} className="flex items-center gap-1.5">
                <span
                  className={cn('h-3 w-3 rounded-full', CONDITION_TOKENS[c].bar)}
                  aria-hidden="true"
                />
                <span className="font-semibold">{counts[c]}</span>
                <span className="p-muted">{conditionText(c)}</span>
              </li>
            ))}
        </ul>
      </PortalPanel>

      {defects.length > 0 && (
        <section aria-labelledby="defects-heading">
          <PortalSectionLabel id="defects-heading" className="mb-3">
            {t('deficienciesFound', { count: defects.length })}
          </PortalSectionLabel>
          <ul className="space-y-2">
            {defects.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'rounded-[var(--p-radius-field)] border p-3.5',
                  CONDITION_TOKENS[item.condition as Condition]?.soft
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium break-words">
                    {item.code && <span className="mr-2 font-mono text-xs">{item.code}</span>}
                    {item.name}
                  </p>
                  <span className="text-xs font-semibold">
                    {gradedText(item.condition as Condition)}
                  </span>
                </div>
                {item.notes && <p className="mt-1 text-sm whitespace-pre-wrap">{item.notes}</p>}
                {value(item)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="all-results-heading" className="space-y-4">
        <PortalSectionLabel id="all-results-heading">{t('allResults')}</PortalSectionLabel>
        {sections.map((section) => (
          <PortalPanel key={section.name} as="div" flush>
            <h3 className="border-b bg-[var(--p-soft)] px-4 py-3 text-base font-semibold sm:px-6">
              {section.code && (
                <span className="p-muted mr-2 font-mono text-xs">{section.code}</span>
              )}
              {section.name}
            </h3>
            <ul>
              {section.items.map((item) => (
                <li key={item.id} className="border-b px-4 py-3.5 last:border-b-0 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-medium break-words">
                      {item.code && (
                        <span className="p-muted mr-2 font-mono text-xs">{item.code}</span>
                      )}
                      {item.name}
                    </p>
                    {grade(item.condition as Condition)}
                  </div>
                  {item.notes && (
                    <p className="p-muted mt-1 text-sm whitespace-pre-wrap">{item.notes}</p>
                  )}
                  {value(item)}
                </li>
              ))}
            </ul>
          </PortalPanel>
        ))}
      </section>
    </div>
  )
}
