'use client'

import { createContext, useContext } from 'react'

interface LicenseExpiryInfo {
  daysUntilExpiry: number | null
}

const LicenseExpiryContext = createContext<LicenseExpiryInfo>({ daysUntilExpiry: null })

export function LicenseExpiryProvider({
  daysUntilExpiry,
  children,
}: {
  daysUntilExpiry: number | null
  children: React.ReactNode
}) {
  return (
    <LicenseExpiryContext.Provider value={{ daysUntilExpiry }}>
      {children}
    </LicenseExpiryContext.Provider>
  )
}

export function useLicenseExpiry() {
  return useContext(LicenseExpiryContext)
}
