'use client'

import { createContext, useContext } from 'react'

/** One of the workshop's meters besides the odometer, as a form or a sample names it. */
export interface MeterTypeName {
  id: string
  name: string
  unit: string
}

/**
 * The workshop's meters in use, for the pages that show them (the document
 * designer). Empty outside a provider and for a workshop that has none, so
 * nothing about meters is drawn.
 */
const MeterTypesContext = createContext<MeterTypeName[]>([])

export function MeterTypesProvider({
  value,
  children,
}: {
  value: MeterTypeName[]
  children: React.ReactNode
}) {
  return <MeterTypesContext.Provider value={value}>{children}</MeterTypesContext.Provider>
}

export function useMeterTypes(): MeterTypeName[] {
  return useContext(MeterTypesContext)
}
