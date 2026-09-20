'use client'

import { useForceLightTheme } from '@/hooks/use-force-light-theme'

/** A page for a phone held up next to a car, often outdoors: always light. */
export default function PhotoHandoffLayout({ children }: { children: React.ReactNode }) {
  useForceLightTheme()
  return <>{children}</>
}
