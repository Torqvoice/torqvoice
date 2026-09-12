'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  type LucideIcon,
  Loader2,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Smartphone,
  Tablet,
  Wrench,
} from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import {
  type SignedInDevice,
  signOutDevice,
  signOutOtherDevices,
} from '@/features/settings/Actions/sessionActions'
import type { DeviceKind } from '@/lib/known-devices'

const ICONS: Record<DeviceKind, LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
  app: Wrench,
  unknown: MonitorSmartphone,
}

/**
 * Every open session on the account, drawn as the device it came from, with
 * a way to end any of them. The browser looking at the page is marked and
 * cannot be ended from here; sign out does that.
 */
export function SignedInDevices({ devices }: { devices: SignedInDevice[] }) {
  const t = useTranslations('settings')
  const format = useFormatter()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const others = devices.filter((d) => !d.current)

  const endOne = (id: string) => {
    setBusy(id)
    startTransition(async () => {
      const result = await signOutDevice(id)
      setBusy(null)
      if (result.success) {
        toast.success(t('account.deviceSignedOut'))
        router.refresh()
      } else {
        toast.error(t('account.failedSignOutDevice'))
      }
    })
  }

  const endOthers = () => {
    setBusy('others')
    startTransition(async () => {
      const result = await signOutOtherDevices()
      setBusy(null)
      if (result.success) {
        toast.success(t('account.othersSignedOut'))
        router.refresh()
      } else {
        toast.error(t('account.failedSignOutDevice'))
      }
    })
  }

  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <AppCard
      icon={MonitorSmartphone}
      title={t('account.devicesTitle')}
      description={t('account.devicesDescription')}
      contentClassName="p-0"
      action={
        others.length > 0 ? (
          <Button variant="outline" size="sm" onClick={endOthers} disabled={pending}>
            {busy === 'others' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" />
            )}
            {t('account.signOutOthers')}
          </Button>
        ) : undefined
      }
    >
      <ul className="divide-y divide-border/60" data-testid="signed-in-devices">
        {devices.map((device) => {
          const Icon = ICONS[device.kind]
          return (
            <li
              key={device.id}
              className={`group flex items-center gap-4 px-6 py-4 transition-colors ${
                device.current ? 'bg-primary/[0.03]' : 'hover:bg-muted/40'
              }`}
              data-testid="signed-in-device"
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                  device.current
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-muted/50 text-muted-foreground'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-medium">{device.label}</span>
                  {device.current && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {t('account.thisDevice')}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{t('account.lastActiveAt', { date: when(device.lastActiveAt) })}</span>
                  <span aria-hidden="true" className="text-border">
                    ·
                  </span>
                  <span>{t('account.signedInAt', { date: when(device.createdAt) })}</span>
                  {device.ip && (
                    <>
                      <span aria-hidden="true" className="text-border">
                        ·
                      </span>
                      <span className="font-mono text-[11px]">{device.ip}</span>
                    </>
                  )}
                </p>
              </div>

              {!device.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => endOne(device.id)}
                  disabled={pending}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`${t('account.signOutDevice')}: ${device.label}`}
                >
                  {busy === device.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  <span className="ml-2 hidden sm:inline">{t('account.signOutDevice')}</span>
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </AppCard>
  )
}
