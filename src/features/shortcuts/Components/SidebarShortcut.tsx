'use client'

import { useSidebar } from '@/components/ui/sidebar'
import { useShortcut } from './ShortcutsProvider'

/** Shows or hides the sidebar on its shortcut. Sits inside the sidebar's provider. */
export function SidebarShortcut() {
  const { toggleSidebar } = useSidebar()
  useShortcut('general.sidebar', toggleSidebar)
  return null
}
