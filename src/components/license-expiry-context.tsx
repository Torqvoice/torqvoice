'use client'

import { createContext, useContext, useState } from 'react'
import { dismissLicenseExpiryBanner } from '@/features/settings/Actions/settingsActions'

interface LicenseExpiryInfo {
  daysUntilExpiry: number | null
  dismissed: boolean
  dismiss: () => void
}

const LicenseExpiryContext = createContext<LicenseExpiryInfo>({
  daysUntilExpiry: null,
  dismissed: false,
  // biome-ignore lint/suspicious/noEmptyBlockStatements: default noop
  dismiss: () => {},
})

export function LicenseExpiryProvider({
  daysUntilExpiry,
  dismissed: initialDismissed,
  children,
}: {
  daysUntilExpiry: number | null
  dismissed: boolean
  children: React.ReactNode
}) {
  const [dismissed, setDismissed] = useState(initialDismissed)

  const dismiss = () => {
    setDismissed(true)
    dismissLicenseExpiryBanner()
  }

  return (
    <LicenseExpiryContext.Provider value={{ daysUntilExpiry, dismissed, dismiss }}>
      {children}
    </LicenseExpiryContext.Provider>
  )
}

export function useLicenseExpiry() {
  return useContext(LicenseExpiryContext)
}
