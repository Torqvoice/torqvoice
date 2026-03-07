'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'
const DISMISS_DURATION = 30 * 24 * 60 * 60 * 1000 // 30 days

function isDismissed(): boolean {
  try {
    const val = localStorage.getItem(DISMISS_KEY)
    if (!val) return false
    return Date.now() - Number(val) < DISMISS_DURATION
  } catch {
    return false
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // localStorage unavailable
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone)
  )
}

function isIOSSafari(): boolean {
  const ua = navigator.userAgent
  return /iP(hone|od|ad)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [canShow, setCanShow] = useState(false)

  useEffect(() => {
    if (isStandalone() || isDismissed()) return
    if (process.env.NODE_ENV === 'development') return

    if (isIOSSafari()) {
      setIsIOS(true)
      setCanShow(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setCanShow(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setCanShow(false)
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const hide = useCallback(() => {
    dismiss()
    setCanShow(false)
  }, [])

  return { canShow, isIOS, install, hide }
}

export function InstallBanner() {
  const { canShow, isIOS, install, hide } = useInstallPrompt()

  if (!canShow) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-300">
      <div className="border-t bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Image
            src="/icons/icon-192.png"
            alt="TorqVoice"
            width={40}
            height={40}
            className="shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Install TorqVoice</p>
            <p className="truncate text-xs text-muted-foreground">
              {isIOS
                ? 'Tap Share then "Add to Home Screen"'
                : 'Add to your home screen for quick access'}
            </p>
          </div>
          {!isIOS && (
            <Button size="sm" onClick={install}>
              Install
            </Button>
          )}
          <button
            onClick={hide}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function SidebarInstallButton() {
  const { canShow, isIOS, install, hide } = useInstallPrompt()

  if (!canShow) return null

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={isIOS ? hide : install}
            tooltip={isIOS ? 'Tap Share > Add to Home Screen' : 'Install App'}
          >
            <Download className="size-4" />
            <span className="font-medium">Install App</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
