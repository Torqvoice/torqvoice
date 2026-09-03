'use client'

import { useForceLightTheme } from '@/hooks/use-force-light-theme'

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  useForceLightTheme()
  return <>{children}</>
}
