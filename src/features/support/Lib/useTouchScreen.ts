'use client'

import { useEffect, useState } from 'react'

/**
 * Phones and tablets: a finger as the main pointer, or a screen narrower than
 * a laptop's. A touchscreen laptop keeps the button, its main pointer is a mouse.
 */
export const TOUCH_SCREEN_QUERY = '(pointer: coarse), (max-width: 1023px)'

/**
 * Whether this is a phone or tablet, where the floating support button is not
 * drawn. `null` until the browser has been asked, so a caller can hold back
 * what it would otherwise have to pull away a frame later.
 */
export function useTouchScreen(): boolean | null {
  const [touchScreen, setTouchScreen] = useState<boolean | null>(null)

  useEffect(() => {
    const query = window.matchMedia?.(TOUCH_SCREEN_QUERY)
    if (!query) {
      setTouchScreen(false)
      return
    }
    const sync = () => setTouchScreen(query.matches)
    sync()
    // Rotating a small tablet or resizing a window moves it across the line.
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return touchScreen
}
