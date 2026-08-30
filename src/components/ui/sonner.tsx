'use client'

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useEffect, useState } from 'react'
import { useTheme } from '@/components/theme-provider'
import { DEFAULT_THEME, getThemeMode } from '@/lib/themes'

const Toaster = ({ ...props }: ToasterProps) => {
  // Presets resolve to a light or dark mode; sonner only understands those.
  const { mode } = useTheme()

  // The stored theme is client-only, so keep the server default until mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <Sonner
      theme={mounted ? mode : getThemeMode(DEFAULT_THEME)}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
