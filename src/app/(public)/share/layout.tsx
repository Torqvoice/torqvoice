'use client'

import { useLayoutEffect } from 'react'

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains('dark')
    root.setAttribute('data-force-theme', 'light')
    root.classList.remove('dark')
    root.classList.add('light')
    return () => {
      root.removeAttribute('data-force-theme')
      root.classList.remove('light')
      if (hadDark) root.classList.add('dark')
    }
  }, [])

  return <>{children}</>
}
