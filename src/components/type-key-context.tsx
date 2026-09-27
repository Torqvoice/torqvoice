'use client'

import { createContext, useContext } from 'react'

/**
 * Whether this workshop records the German type key (HSN/TSN) on vehicles.
 * Settings → Workshop switches it on; until then no form, page or designer
 * list shows it.
 */
const TypeKeyContext = createContext(false)

export function TypeKeyProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: React.ReactNode
}) {
  return <TypeKeyContext.Provider value={enabled}>{children}</TypeKeyContext.Provider>
}

export function useTypeKeyEnabled(): boolean {
  return useContext(TypeKeyContext)
}
