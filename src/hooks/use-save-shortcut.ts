'use client'

import { useEffect } from 'react'

export function useSaveShortcut(onSave: () => void | Promise<void>, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        void onSave()
      }
    }
    // On the document so it runs before SaveShortcutListener's page fallback,
    // which sits on the window and steps aside once this has handled the key.
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onSave, enabled])
}
