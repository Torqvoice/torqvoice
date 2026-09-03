'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { AlertTriangle, Search, X, Zap } from 'lucide-react'
import { openPlateLookup, usePlateLookupAccess } from '@/components/plate-lookup-context'
import { useShowWhiteLabelCta } from '@/components/white-label-cta-context'
import { useLicenseExpiry } from '@/components/license-expiry-context'
import { BANNER_PRIORITY, useBannerSlot } from '@/components/banner-slot'
import { QuickCreateMenu } from '@/components/quick-create-menu'
import { DocsLink } from '@/components/docs-link'

function SearchTrigger() {
  const t = useTranslations('navigation')
  return (
    <button
      type="button"
      className="hidden h-8 w-56 cursor-pointer items-center gap-2 rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex"
      onClick={() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
      }}
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">{t('search')}</span>
      <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">
        {t('shortcut')}
      </kbd>
    </button>
  )
}

/**
 * The plate lookup, drawn as the thing it looks up: a small plate beside
 * the word. Only rendered once a registry is connected, so a workshop that
 * has none never sees a button that would only explain itself away.
 */
function PlateTrigger() {
  const t = useTranslations('vehicles.plateLookup')
  const { available } = usePlateLookupAccess()
  if (!available) return null
  return (
    <button
      type="button"
      className="group flex h-8 cursor-pointer items-center gap-2 rounded-md border bg-muted/50 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={() => openPlateLookup()}
      aria-label={t('open')}
      title={`${t('open')} (${t('shortcut')})`}
    >
      <span
        aria-hidden
        className="flex h-4 items-center overflow-hidden rounded-[3px] border border-foreground/40 bg-background font-mono text-[9px] font-semibold leading-none tracking-wider text-foreground/80"
      >
        <span className="h-full w-1.5 bg-primary/80" />
        <span className="px-1">AB 123</span>
      </span>
      <span className="hidden lg:inline">{t('open')}</span>
    </button>
  )
}

type BreadcrumbSegment = { key: string; href?: string }

/**
 * Pages that have a documentation page of their own, so the header can offer a
 * "Read more" link straight to it. The docs site resolves the reader's language
 * itself, so these stay locale-free.
 */
const docsMap: Record<string, string> = {
  '/work-orders': '/docs/features/work-orders',
  '/inventory': '/docs/features/inventory',
  '/messages': '/docs/features/messages',
  '/reminders': '/docs/features/reminders',
  // No anchor: heading slugs are translated, so an English one would not match
  // on a localized page.
  '/observations': '/docs/features/work-orders',
  '/billing/recurring': '/docs/features/recurring-invoices',
  '/settings/templates': '/docs/configuration/templates',
  '/calendar': '/docs/features/calendar',
  '/customers': '/docs/features/customers',
  '/vehicles': '/docs/features/vehicles',
  '/quotes': '/docs/features/quotes',
  '/billing': '/docs/features/invoices',
  '/inspections': '/docs/features/inspections',
  '/reports': '/docs/features/reports',
  '/work-board': '/docs/configuration/work-orders/work-board',
  '/labor-presets': '/docs/configuration/work-orders/labor-presets',
  '/audit-log': '/docs/security/audit-logging',
  '/settings/team': '/docs/configuration/team',
  '/settings/customer-portal': '/docs/features/portal',
  '/settings/email': '/docs/integrations/email',
  '/settings/sms': '/docs/integrations/sms',
  '/settings/webhooks': '/docs/integrations/webhooks',
  '/settings/subscription': '/docs/configuration/subscription',
  '/settings/license': '/docs/licensing/white-label',
  '/settings/inspection-reminders': '/docs/features/inspection-reminders',
  '/vehicles/inspection-reminders': '/docs/features/inspection-reminders',
  '/': '/docs/features/dashboard',
  '/settings/company': '/docs/configuration/workshop-profile',
  '/settings/workshop': '/docs/configuration/workshop-profile',
  '/settings/localization': '/docs/configuration/localization',
  '/settings/appearance': '/docs/configuration/localization',
  '/settings/tax': '/docs/configuration/tax',
  '/settings/invoice': '/docs/configuration/invoice-numbering',
  '/settings/payment': '/docs/configuration/payment-providers',
  '/settings/custom-fields': '/docs/configuration/custom-fields',
  '/settings/maintenance': '/docs/configuration/predicted-maintenance',
  '/settings/data': '/docs/configuration/backup-and-restore',
  '/settings/alerts': '/docs/features/low-stock-alerts',
  '/settings/ai': '/docs/integrations/ai',
  '/settings/telegram': '/docs/integrations/telegram',
  '/telegram': '/docs/integrations/telegram',
  '/settings/report-schedule': '/docs/features/reports',
  '/settings/account': '/docs/security/passkeys-and-2fa',
  '/sales': '/docs/features/work-orders',
  '/tire-hotel': '/docs/features/tire-hotel',
  '/tire-hotel/storage': '/docs/features/tire-hotel',
  '/tire-hotel/forecast': '/docs/features/tire-hotel',
  '/settings/tire-hotel': '/docs/features/tire-hotel',
}

const breadcrumbMap: Record<string, BreadcrumbSegment[]> = {
  '/': [{ key: 'dashboard' }],
  '/vehicles': [{ key: 'vehicles', href: '/vehicles' }, { key: 'allVehicles' }],
  '/customers': [{ key: 'customers', href: '/customers' }, { key: 'allCustomers' }],
  '/work-orders': [{ key: 'workOrders', href: '/work-orders' }, { key: 'allWorkOrders' }],
  '/quotes': [{ key: 'quotes', href: '/quotes' }, { key: 'allQuotes' }],
  '/billing': [{ key: 'billing', href: '/billing' }, { key: 'billingHistory' }],
  '/inventory': [{ key: 'inventory', href: '/inventory' }, { key: 'allParts' }],
  '/reports': [{ key: 'reports', href: '/reports' }, { key: 'reports' }],
  '/reminders': [{ key: 'reminders', href: '/reminders' }, { key: 'allReminders' }],
  '/work-board': [{ key: 'workBoard' }],
  '/work-board/presenter': [{ key: 'workBoard', href: '/work-board' }, { key: 'presenter' }],
  '/admin': [{ key: 'adminOverview' }],
  '/admin/users': [{ key: 'admin', href: '/admin' }, { key: 'users' }],
  '/admin/organizations': [{ key: 'admin', href: '/admin' }, { key: 'organizations' }],
  '/admin/settings': [{ key: 'admin', href: '/admin' }, { key: 'settings' }],
  '/settings': [{ key: 'settings' }],
  '/settings/company': [{ key: 'settings', href: '/settings' }, { key: 'company' }],
  '/settings/account': [{ key: 'settings', href: '/settings' }, { key: 'account' }],
  '/settings/custom-fields': [{ key: 'settings', href: '/settings' }, { key: 'customFields' }],
  '/settings/templates': [{ key: 'settings', href: '/settings' }, { key: 'templates' }],
  '/settings/team': [{ key: 'settings', href: '/settings' }, { key: 'team' }],
  '/settings/invoice': [{ key: 'settings', href: '/settings' }, { key: 'invoice' }],
  '/settings/payment': [{ key: 'settings', href: '/settings' }, { key: 'payment' }],
  '/settings/tax': [{ key: 'settings', href: '/settings' }, { key: 'tax' }],
  '/settings/workshop': [{ key: 'settings', href: '/settings' }, { key: 'workshop' }],
  '/settings/appearance': [{ key: 'settings', href: '/settings' }, { key: 'appearance' }],
  '/settings/email': [{ key: 'settings', href: '/settings' }, { key: 'email' }],
  '/settings/sms': [{ key: 'settings', href: '/settings' }, { key: 'sms' }],
  '/settings/about': [{ key: 'settings', href: '/settings' }, { key: 'about' }],
  '/settings/data': [{ key: 'settings', href: '/settings' }, { key: 'data' }],
  '/settings/license': [{ key: 'settings', href: '/settings' }, { key: 'license' }],
  '/settings/subscription': [{ key: 'settings', href: '/settings' }, { key: 'subscription' }],
  '/settings/maintenance': [{ key: 'settings', href: '/settings' }, { key: 'maintenance' }],
  '/settings/inspection-reminders': [
    { key: 'settings', href: '/settings' },
    { key: 'inspectionReminders' },
  ],
  '/vehicles/inspection-reminders': [
    { key: 'vehicles', href: '/vehicles' },
    { key: 'inspectionReminders' },
  ],
  '/settings/customer-portal': [{ key: 'settings', href: '/settings' }, { key: 'customerPortal' }],
  '/ai': [{ key: 'aiAssistant' }],
  '/audit-log': [{ key: 'auditLog' }],
  '/observations': [{ key: 'observations' }],
  '/tire-hotel': [{ key: 'tireHotel', href: '/tire-hotel' }, { key: 'allTireSets' }],
  '/tire-hotel/storage': [{ key: 'tireHotel', href: '/tire-hotel' }, { key: 'tireStorage' }],
  '/tire-hotel/forecast': [{ key: 'tireHotel', href: '/tire-hotel' }, { key: 'tireForecast' }],
  '/settings/tire-hotel': [{ key: 'settings', href: '/settings' }, { key: 'tireHotel' }],
}

export function PageHeader() {
  const pathname = usePathname()
  const showWhiteLabelCta = useShowWhiteLabelCta()
  const { daysUntilExpiry, dismissed, dismiss } = useLicenseExpiry()
  // Weeks of warning before a licence lapses, so this waits behind anything
  // happening right now rather than adding a second bar beneath it.
  const showLicenceNotice = useBannerSlot(
    'licence',
    BANNER_PRIORITY.licence,
    daysUntilExpiry !== null && daysUntilExpiry <= 14 && !dismissed
  )
  const t = useTranslations('navigation.breadcrumbs')
  const tn = useTranslations('navigation')

  // A set's own page is still the tire hotel, and somebody reading a set is
  // as likely to want the manual as somebody reading the list.
  const docsHref =
    docsMap[pathname] ??
    (/^\/tire-hotel\/[^/]+$/.test(pathname)
      ? '/docs/features/tire-hotel'
      : /^\/vehicles\/inspection-reminders\/[^/]+$/.test(pathname)
        ? '/docs/features/inspection-reminders'
        : undefined)

  // Match exact route first
  let segments = breadcrumbMap[pathname]

  if (!segments) {
    // /tire-hotel/[id]
    if (/^\/tire-hotel\/[^/]+$/.test(pathname)) {
      segments = [{ key: 'tireHotel', href: '/tire-hotel' }, { key: 'tireSetDetails' }]
    }
    // /quotes/[id]/edit
    else if (/^\/quotes\/[^/]+\/edit$/.test(pathname)) {
      const quoteId = pathname.split('/')[2]
      segments = [
        { key: 'quotes', href: '/quotes' },
        { key: 'quoteDetails', href: `/quotes/${quoteId}` },
        { key: 'edit' },
      ]
    }
    // /quotes/[id]
    else if (/^\/quotes\/[^/]+$/.test(pathname)) {
      segments = [{ key: 'quotes', href: '/quotes' }, { key: 'quoteDetails' }]
    }
    // /vehicles/[id]/service/new
    else if (/^\/vehicles\/[^/]+\/service\/new$/.test(pathname)) {
      const vehicleId = pathname.split('/')[2]
      segments = [
        { key: 'vehicles', href: '/vehicles' },
        { key: 'vehicleDetails', href: `/vehicles/${vehicleId}` },
        { key: 'newServiceRecord' },
      ]
    }
    // /vehicles/[id]/service/[serviceId]
    else if (/^\/vehicles\/[^/]+\/service\/[^/]+$/.test(pathname)) {
      segments = [{ key: 'vehicles', href: '/vehicles' }, { key: 'serviceDetails' }]
    }
    // /vehicles/[id]
    else if (pathname.startsWith('/vehicles/')) {
      segments = [{ key: 'vehicles', href: '/vehicles' }, { key: 'vehicleDetails' }]
    }
    // /customers/[id]
    else if (pathname.startsWith('/customers/')) {
      segments = [{ key: 'customers', href: '/customers' }, { key: 'customerDetails' }]
    } else {
      segments = [{ key: 'home' }]
    }
  }

  return (
    <>
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {segments.map((segment, i) => {
              const isLast = i === segments.length - 1
              if (isLast) {
                return (
                  <BreadcrumbItem key={i}>
                    {/* A trail of one is not a trail. Pages that sit at the
                        top level get their crumb styled as the page title. */}
                    <BreadcrumbPage
                      className={segments.length === 1 ? 'text-base font-semibold' : undefined}
                    >
                      {t(segment.key)}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                )
              }
              return (
                <Fragment key={i}>
                  <BreadcrumbItem className="hidden md:block">
                    {segment.href ? (
                      <BreadcrumbLink href={segment.href}>{t(segment.key)}</BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{t(segment.key)}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          {docsHref && <DocsLink href={docsHref} variant="header" className="hidden sm:flex" />}
          <PlateTrigger />
          <SearchTrigger />
          <QuickCreateMenu />
          {showWhiteLabelCta && (
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link href="/settings/license">
                <Zap className="mr-2 h-3 w-3" />
                {tn('purchaseWhiteLabel')}
              </Link>
            </Button>
          )}
        </div>
      </header>
      {showLicenceNotice && daysUntilExpiry !== null && (
        <div
          className={`flex items-center gap-2 px-4 py-2 text-sm ${
            daysUntilExpiry <= 0
              ? 'bg-destructive/10 text-destructive border-b border-destructive/20'
              : daysUntilExpiry <= 3
                ? 'bg-red-500/10 text-red-600 border-b border-red-500/20'
                : 'bg-amber-500/10 text-amber-600 border-b border-amber-500/20'
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {daysUntilExpiry <= 0
              ? tn('licenseExpired')
              : daysUntilExpiry === 1
                ? tn('licenseExpiresTomorrow')
                : tn('licenseExpiresDays', { days: daysUntilExpiry })}
          </span>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Link href="/settings/license" className="font-medium underline hover:no-underline">
              {tn('licenseRenew')}
            </Link>
            <button type="button" onClick={dismiss} className="p-0.5 rounded hover:bg-black/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
