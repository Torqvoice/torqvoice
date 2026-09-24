'use client'

import { useTranslations } from 'next-intl'
import { useShopFeeConfig } from './ShopFeeContext'

/**
 * Stands where the hourly/service switch is on a shop fee line: the line is
 * neither, and switching it would turn the fee into ordinary labour.
 */
export function ShopFeeTag() {
  const t = useTranslations('service.labor')
  const config = useShopFeeConfig()
  const hint =
    config?.mode === 'percent'
      ? t(config.base === 'laborParts' ? 'shopFeeHintPercentAll' : 'shopFeeHintPercentLabor', {
          percent: config.percent,
        })
      : t('shopFeeHintFlat')
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 text-[10px] font-medium text-amber-700 dark:text-amber-400"
      title={hint}
    >
      {t('shopFeeTag')}
    </span>
  )
}

/** Whether a fee line's amount is priced from the job rather than typed. */
export function useShopFeeLocked(): boolean {
  return useShopFeeConfig()?.mode === 'percent'
}
