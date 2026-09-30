'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { EN_LIBRARY, type InspectionLibrary, loadInspectionLibrary } from './inspectionLibrary'

/**
 * The checklist library in the viewer's language. English is returned until
 * the locale's file has loaded, so nothing waits on it to render.
 */
export function useInspectionLibrary(): InspectionLibrary {
  const locale = useLocale()
  const [lib, setLib] = useState<InspectionLibrary>(EN_LIBRARY)

  useEffect(() => {
    let cancelled = false
    loadInspectionLibrary(locale).then((loaded) => {
      if (!cancelled) setLib(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [locale])

  return lib
}
