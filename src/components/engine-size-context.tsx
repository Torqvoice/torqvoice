'use client'

import { createContext, useContext } from 'react'
import type { EngineSizeUnit } from '@/lib/engine-size'

/**
 * The unit this workshop writes engine size in, chosen under Settings →
 * Workshop → Units. Litres until somebody picks cubic centimetres.
 */
const EngineSizeUnitContext = createContext<EngineSizeUnit>('litres')

export function EngineSizeUnitProvider({
  unit,
  children,
}: {
  unit: EngineSizeUnit
  children: React.ReactNode
}) {
  return <EngineSizeUnitContext.Provider value={unit}>{children}</EngineSizeUnitContext.Provider>
}

export function useEngineSizeUnit(): EngineSizeUnit {
  return useContext(EngineSizeUnitContext)
}
