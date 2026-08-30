'use client'

import { useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { conditionGrade, type Condition, type SeverityScale, type TestResult } from './conditions'

/**
 * Translated names for the defect grades and the overall result.
 *
 * conditions.ts stays free of i18n on purpose: it also runs on the server for
 * the PDF, where the locale arrives as a bag of labels rather than a React
 * context. This hook is the client-side view of the same vocabulary, so the
 * page, the shared report and the certificate all say the same thing in
 * whichever language the reader has.
 */
export function useConditionLabels(scale: SeverityScale, country?: string | null) {
  const t = useTranslations('inspections')

  const label = useCallback(
    (condition: Condition) => t(`grades.${scale === 'basic' ? 'basic' : 'eu'}.${condition}`),
    [t, scale]
  )

  const short = useCallback((condition: Condition) => t(`grades.short.${condition}`), [t])

  const hint = useCallback((condition: Condition) => t(`grades.hint.${condition}`), [t])

  /** "2 — Vesentlig mangel" where the country numbers its grades, else the name. */
  const graded = useCallback(
    (condition: Condition) => {
      const grade = conditionGrade(condition, scale, country)
      const text = label(condition)
      return grade === null ? text : `${grade} — ${text}`
    },
    [label, scale, country]
  )

  const result = useCallback((value: TestResult) => t(`results.${value}`), [t])
  const resultDetail = useCallback((value: TestResult) => t(`results.detail.${value}`), [t])

  return { label, short, hint, graded, result, resultDetail }
}
