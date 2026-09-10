'use client'

import { createContext, useContext, useState } from 'react'
import { dismissLicenseExpiryBanner } from '@/features/settings/Actions/settingsActions'

interface LicenseExpiryInfo {
  daysUntilExpiry: number | null
  /**
   * Days until an unrefreshed licence token is no longer trusted, once the
   * warning threshold is crossed. 0 means branding has already returned.
   * null when the token is fresh or there is no licence at all.
   */
  unverifiedDaysLeft: number | null
  dismissed: boolean
  dismiss: () => void
}

const LicenseExpiryContext = createContext<LicenseExpiryInfo>({
  daysUntilExpiry: null,
  unverifiedDaysLeft: null,
  dismissed: false,
  // biome-ignore lint/suspicious/noEmptyBlockStatements: default noop
  dismiss: () => {},
})

export function LicenseExpiryProvider({
  daysUntilExpiry,
  unverifiedDaysLeft,
  dismissed: initialDismissed,
  children,
}: {
  daysUntilExpiry: number | null
  unverifiedDaysLeft: number | null
  dismissed: boolean
  children: React.ReactNode
}) {
  const [dismissed, setDismissed] = useState(initialDismissed)

  const dismiss = () => {
    setDismissed(true)
    dismissLicenseExpiryBanner()
  }

  return (
    <LicenseExpiryContext.Provider
      value={{ daysUntilExpiry, unverifiedDaysLeft, dismissed, dismiss }}
    >
      {children}
    </LicenseExpiryContext.Provider>
  )
}

export function useLicenseExpiry() {
  return useContext(LicenseExpiryContext)
}
