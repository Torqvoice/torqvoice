'use client'

import { createContext, useContext } from 'react'

/**
 * Whether this workshop records a Fleet / unit number on vehicles.
 * Settings → Workshop switches it on; until then no form, page, list or
 * designer shows it.
 */
const FleetNumberContext = createContext(false)

export function FleetNumberProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: React.ReactNode
}) {
  return <FleetNumberContext.Provider value={enabled}>{children}</FleetNumberContext.Provider>
}

export function useFleetNumberEnabled(): boolean {
  return useContext(FleetNumberContext)
}
