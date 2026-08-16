'use client'

import { useForceLightTheme } from '@/hooks/use-force-light-theme'

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  useForceLightTheme()

  return <>{children}</>
}
