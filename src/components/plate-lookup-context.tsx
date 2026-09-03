'use client'

import { createContext, useContext } from 'react'

export interface PlateLookupAccess {
  /** A registry with plate lookup is connected and the plan allows integrations. */
  available: boolean
  /** The signed-in account may add vehicles, so a miss can offer to. */
  canCreate: boolean
  /** The connected registry's name, such as "RDW Open Data", for the palette's wording. */
  registryName: string | null
}

const PlateLookupContext = createContext<PlateLookupAccess>({
  available: false,
  canCreate: false,
  registryName: null,
})

/**
 * Resolved once in the layout so the header knows on first paint whether to
 * show the plate lookup, instead of every page asking the server again.
 */
export function PlateLookupProvider({
  value,
  children,
}: {
  value: PlateLookupAccess
  children: React.ReactNode
}) {
  return <PlateLookupContext.Provider value={value}>{children}</PlateLookupContext.Provider>
}

export function usePlateLookupAccess() {
  return useContext(PlateLookupContext)
}

/** The event the header trigger fires; the palette listens for it. */
export const PLATE_LOOKUP_EVENT = 'torqvoice:plate-lookup'

export function openPlateLookup(plate?: string) {
  document.dispatchEvent(new CustomEvent(PLATE_LOOKUP_EVENT, { detail: { plate } }))
}
