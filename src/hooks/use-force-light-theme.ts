'use client'

import { useLayoutEffect } from 'react'
import { ALL_THEME_CLASSES } from '@/lib/themes'

/**
 * Pins the document to the light theme for public pages (portal, share links),
 * regardless of the workshop user's own theme. Any preset classes are stripped
 * as well, then restored when the page unmounts.
 */
export function useForceLightTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement
    const previous = ALL_THEME_CLASSES.filter((cls) => root.classList.contains(cls))

    root.setAttribute('data-force-theme', 'light')
    root.classList.remove(...ALL_THEME_CLASSES)
    root.classList.add('light')

    return () => {
      root.removeAttribute('data-force-theme')
      root.classList.remove(...ALL_THEME_CLASSES)
      root.classList.add(...previous)
    }
  }, [])
}
