'use client'

import { createContext, useContext } from 'react'
import type { ShopFeeConfig } from '../Lib/shopFee'

/**
 * The workshop's shop fee, for the line editors: a percentage fee's line is
 * priced from the job and cannot be typed over, a flat one can.
 */
const ShopFeeContext = createContext<ShopFeeConfig | null>(null)

export const ShopFeeProvider = ShopFeeContext.Provider

export function useShopFeeConfig(): ShopFeeConfig | null {
  return useContext(ShopFeeContext)
}
