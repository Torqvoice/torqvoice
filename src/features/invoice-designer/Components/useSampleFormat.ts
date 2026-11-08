'use client'

import { useMemo } from 'react'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { useDateSettings } from '@/components/date-settings-context'
import { formatDateForPdf } from '@/lib/format'
import type { SampleFormat } from './sample'

/**
 * The workshop's currency and date format, for the sample sheet, so the
 * designer previews the money and dates its printed sheets will carry.
 */
export function useSampleFormat(): SampleFormat {
  const formatMoney = useFormatCurrency()
  const { dateFormat } = useDateSettings()
  return useMemo(
    () => ({
      money: (amount: number) => formatMoney(amount),
      // The sample's dates are calendar dates, set at noon UTC: read in UTC they
      // are the same day on the server and in every browser, wherever it is.
      date: (date: Date) => formatDateForPdf(date, dateFormat, 'UTC'),
    }),
    [formatMoney, dateFormat]
  )
}
