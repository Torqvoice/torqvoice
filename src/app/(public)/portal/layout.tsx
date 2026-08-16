'use client'

import { useForceLightTheme } from '@/hooks/use-force-light-theme'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  useForceLightTheme()

  return <>{children}</>
}
