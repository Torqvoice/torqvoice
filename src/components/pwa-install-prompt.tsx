'use client'

import { useCallback, useEffect, useReducer, useState } from 'react'
import Image from 'next/image'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

import { useTranslations } from 'next-intl'
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'
const DISMISS_DURATION = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * The install state lives outside React. Chrome fires `beforeinstallprompt`
 * again on later navigations, so a per-component listener would flip the
 * banner back on after the user dismissed it (the dismissal was only checked
 * on mount, which is why it took a hard refresh to stay gone). Keeping the
 * captured event and the subscriber set at module scope also means the banner,
 * the sidebar entry and the settings page all see the same state and update
 * together.
 */
let promptEvent: BeforeInstallPromptEvent | null = null
let installed = false
let listenersBound = false
const subscribers = new Set<() => void>()

function emit() {
  for (const notify of subscribers) notify()
}

function bindListeners() {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    promptEvent = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    promptEvent = null
    installed = true
    emit()
  })
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

function dismissedUntil(): number {
  try {
    return Number(localStorage.getItem(DISMISS_KEY)) || 0
  } catch {
    return 0
  }
}

export function useInstallPrompt() {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  // Nothing about the device is known during SSR or the first client render,
  // so everything below stays false until after hydration.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    bindListeners()
    subscribers.add(rerender)
    setReady(true)
    return () => {
      subscribers.delete(rerender)
    }
  }, [])

  const standalone = ready && isStandalone()
  const isIOS = ready && !standalone && isIOSSafari()

  const install = useCallback(async () => {
    if (!promptEvent) return false
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    promptEvent = null
    if (outcome === 'accepted') installed = true
    emit()
    return outcome === 'accepted'
  }, [])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // localStorage unavailable; the in-memory flag below still hides it
    }
    emit()
  }, [])

  const restore = useCallback(() => {
    try {
      localStorage.removeItem(DISMISS_KEY)
    } catch {
      // localStorage unavailable
    }
    emit()
  }, [])

  return {
    /** The browser offered an install prompt, or this is iOS Safari. */
    canInstall: ready && !standalone && !installed && (promptEvent !== null || isIOS),
    /** Already running as an installed app, or installed during this session. */
    installed: standalone || (ready && installed),
    isIOS,
    /** True while the user's "not now" is still in effect (30 days). */
    dismissed: ready && Date.now() - dismissedUntil() < DISMISS_DURATION,
    install,
    dismiss,
    restore,
  }
}

export function InstallBanner() {
  const t = useTranslations('common.shared')
  const { canInstall, dismissed, isIOS, install, dismiss } = useInstallPrompt()

  // The banner is noise while developing; the settings page still works there.
  if (process.env.NODE_ENV === 'development') return null
  if (!canInstall || dismissed) return null

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
            <p className="text-sm font-medium">{t('installTorqvoice')}</p>
            <p className="truncate text-xs text-muted-foreground">
              {isIOS ? t('iosInstallHint') : t('installDescription')}
            </p>
          </div>
          {!isIOS && (
            <Button size="sm" onClick={install}>
              {t('install')}
            </Button>
          )}
          <button
            onClick={dismiss}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
            aria-label={t('dismiss')}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function SidebarInstallButton() {
  const t = useTranslations('common.shared')
  const { canInstall, dismissed, isIOS, install, dismiss } = useInstallPrompt()

  if (!canInstall || dismissed) return null

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={isIOS ? dismiss : install}
            tooltip={isIOS ? t('iosInstallHint') : t('installApp')}
          >
            <Download className="size-4" />
            <span className="font-medium">{t('installApp')}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
