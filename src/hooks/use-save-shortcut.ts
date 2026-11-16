'use client'

import { useEffect } from 'react'
import { useShortcutMatcher } from '@/features/shortcuts/Components/ShortcutsProvider'

export function useSaveShortcut(onSave: () => void | Promise<void>, enabled = true) {
  const isSaveShortcut = useShortcutMatcher('general.save')
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (isSaveShortcut(e)) {
        e.preventDefault()
        void onSave()
      }
    }
    // On the document so it runs before SaveShortcutListener's page fallback,
    // which sits on the window and steps aside once this has handled the key.
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onSave, enabled, isSaveShortcut])
}
