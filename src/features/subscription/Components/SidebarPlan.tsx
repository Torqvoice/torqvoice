'use client'

import Link from 'next/link'
import { Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import type { SidebarPlan as SidebarPlanData } from '@/features/subscription/Lib/sidebarPlan.server'

/**
 * The plan row at the foot of the sidebar: which plan the workshop is on,
 * how much of it is used, and the way to the plans.
 *
 * Until it existed a free workshop only learned it was on a plan at all
 * when a limit refused something. Kept quiet on purpose: a muted icon and a
 * thin meter, the way a nav row looks, so it reads as information rather
 * than an advert. Collapsed to icons it is one icon with the same words in
 * its tooltip, like every other row.
 */
export function SidebarPlan({ plan }: { plan: SidebarPlanData }) {
  const t = useTranslations('navigation.sidebar.plan')
  const tSettings = useTranslations('settings.subscription')
  const { isMobile, setOpenMobile } = useSidebar()

  const label =
    plan.kind === 'free'
      ? t('free')
      : t('demo', {
          plan: plan.plan === 'enterprise' ? tSettings('planEnterprise') : tSettings('planPro'),
        })

  const detail =
    plan.kind === 'free'
      ? t('customers', { used: plan.customers, limit: plan.customerLimit })
      : plan.daysLeft !== null
        ? t('endsIn', { days: plan.daysLeft })
        : null

  // The plans page's meter, the same arithmetic and the same colours.
  const over = plan.kind === 'free' && plan.customers > plan.customerLimit
  const share =
    plan.kind === 'free' && plan.customerLimit > 0
      ? Math.min(100, (plan.customers / plan.customerLimit) * 100)
      : 0

  const handleClick = () => {
    track(
      'plan:sidebar_upgrade_click',
      plan.kind === 'free'
        ? { kind: 'free', customers: plan.customers, customer_limit: plan.customerLimit }
        : { kind: 'demo' }
    )
    if (isMobile) setOpenMobile(false)
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={{
          children: (
            <span className="grid gap-0.5">
              <span className="font-medium">{label}</span>
              {detail && <span>{detail}</span>}
              <span>{t('upgrade')}</span>
            </span>
          ),
        }}
        className="h-auto border border-sidebar-border group-data-[collapsible=icon]:border-0"
      >
        <Link href="/settings/subscription" onClick={handleClick}>
          <Zap className="size-4" />
          <div className="grid min-w-0 flex-1 gap-1 leading-tight group-data-[collapsible=icon]:hidden">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{label}</span>
              <span className="shrink-0 text-xs font-medium underline-offset-4 group-hover/menu-item:underline">
                {t('upgrade')}
              </span>
            </div>
            {plan.kind === 'free' && (
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-sidebar-border">
                <div
                  className={cn(
                    'h-full rounded-full',
                    over ? 'bg-destructive' : 'bg-sidebar-primary'
                  )}
                  style={{ width: `${share}%` }}
                />
              </div>
            )}
            {detail && (
              <span
                className={cn(
                  'truncate text-xs',
                  over ? 'font-medium text-destructive' : 'text-sidebar-foreground/60'
                )}
              >
                {detail}
              </span>
            )}
          </div>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
