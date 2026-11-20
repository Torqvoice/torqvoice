'use client'

import { createContext, useContext } from 'react'

/**
 * The names of the workshop's kinds of equipment (Crane, Tail lift), for the
 * pages that offer to print them (the document designer). Empty outside a
 * provider, for a workshop that has defined none and on a plan without custom
 * fields, so nothing about equipment is drawn.
 */
const EquipmentTypesContext = createContext<string[]>([])

export function EquipmentTypesProvider({
  value,
  children,
}: {
  value: string[]
  children: React.ReactNode
}) {
  return <EquipmentTypesContext.Provider value={value}>{children}</EquipmentTypesContext.Provider>
}

export function useEquipmentTypes(): string[] {
  return useContext(EquipmentTypesContext)
}
