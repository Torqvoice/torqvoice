'use client'

import { useEffect } from 'react'

export function PWAServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed — ignore silently
      })
    }
  }, [])

  return null
}
