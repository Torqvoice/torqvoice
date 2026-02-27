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
import { Search, Zap } from 'lucide-react'
import { useShowWhiteLabelCta } from '@/components/white-label-cta-context'
import { NewWorkOrderButton } from '@/components/new-work-order-button'

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

type BreadcrumbSegment = { key: string; href?: string }

const breadcrumbMap: Record<string, BreadcrumbSegment[]> = {
  '/': [{ key: 'dashboard' }],
  '/vehicles': [{ key: 'vehicles', href: '/vehicles' }, { key: 'allVehicles' }],
  '/customers': [{ key: 'customers', href: '/customers' }, { key: 'allCustomers' }],
  '/work-orders': [{ key: 'workOrders', href: '/work-orders' }, { key: 'allWorkOrders' }],
  '/quotes': [{ key: 'quotes', href: '/quotes' }, { key: 'allQuotes' }],
  '/quotes/new': [{ key: 'quotes', href: '/quotes' }, { key: 'newQuote' }],
  '/billing': [{ key: 'billing', href: '/billing' }, { key: 'billingHistory' }],
  '/inventory': [{ key: 'inventory', href: '/inventory' }, { key: 'allParts' }],
  '/reports': [{ key: 'reports', href: '/reports' }, { key: 'reports' }],
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
  '/settings/currency': [{ key: 'settings', href: '/settings' }, { key: 'currency' }],
  '/settings/workshop': [{ key: 'settings', href: '/settings' }, { key: 'workshop' }],
  '/settings/appearance': [{ key: 'settings', href: '/settings' }, { key: 'appearance' }],
  '/settings/email': [{ key: 'settings', href: '/settings' }, { key: 'email' }],
  '/settings/sms': [{ key: 'settings', href: '/settings' }, { key: 'sms' }],
  '/settings/about': [{ key: 'settings', href: '/settings' }, { key: 'about' }],
  '/settings/data': [{ key: 'settings', href: '/settings' }, { key: 'data' }],
  '/settings/license': [{ key: 'settings', href: '/settings' }, { key: 'license' }],
  '/settings/subscription': [{ key: 'settings', href: '/settings' }, { key: 'subscription' }],
  '/settings/maintenance': [{ key: 'settings', href: '/settings' }, { key: 'maintenance' }],
  '/settings/customer-portal': [{ key: 'settings', href: '/settings' }, { key: 'customerPortal' }],
}

export function PageHeader() {
  const pathname = usePathname()
  const showWhiteLabelCta = useShowWhiteLabelCta()
  const t = useTranslations('navigation.breadcrumbs')
  const tn = useTranslations('navigation')

  // Match exact route first
  let segments = breadcrumbMap[pathname]

  if (!segments) {
    // /quotes/[id]/edit
    if (/^\/quotes\/[^/]+\/edit$/.test(pathname)) {
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
                  <BreadcrumbPage>{t(segment.key)}</BreadcrumbPage>
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
        <SearchTrigger />
        <NewWorkOrderButton />
        {showWhiteLabelCta && (
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/license">
              <Zap className="mr-2 h-3 w-3" />
              {tn('purchaseWhiteLabel')}
            </Link>
          </Button>
        )}
      </div>
    </header>
  )
}
