'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  return (
    <button
      type="button"
      className="hidden h-8 w-56 cursor-pointer items-center gap-2 rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex"
      onClick={() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
      }}
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">Search...</span>
      <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">
        Ctrl+K
      </kbd>
    </button>
  )
}

type BreadcrumbSegment = { label: string; href?: string }

const breadcrumbMap: Record<string, BreadcrumbSegment[]> = {
  '/': [{ label: 'Dashboard' }],
  '/vehicles': [{ label: 'Vehicles', href: '/vehicles' }, { label: 'All Vehicles' }],
  '/customers': [{ label: 'Customers', href: '/customers' }, { label: 'All Customers' }],
  '/work-orders': [{ label: 'Work Orders', href: '/work-orders' }, { label: 'All Work Orders' }],
  '/quotes': [{ label: 'Quotes', href: '/quotes' }, { label: 'All Quotes' }],
  '/quotes/new': [{ label: 'Quotes', href: '/quotes' }, { label: 'New Quote' }],
  '/billing': [{ label: 'Billing', href: '/billing' }, { label: 'Billing History' }],
  '/inventory': [{ label: 'Inventory', href: '/inventory' }, { label: 'All Parts' }],
  '/reports': [{ label: 'Reports', href: '/reports' }, { label: 'Reports' }],
  '/admin': [{ label: 'Admin Overview' }],
  '/admin/users': [{ label: 'Admin', href: '/admin' }, { label: 'Users' }],
  '/admin/organizations': [{ label: 'Admin', href: '/admin' }, { label: 'Organizations' }],
  '/admin/settings': [{ label: 'Admin', href: '/admin' }, { label: 'Settings' }],
  '/settings': [{ label: 'Settings' }],
  '/settings/company': [{ label: 'Settings', href: '/settings' }, { label: 'Company' }],
  '/settings/account': [{ label: 'Settings', href: '/settings' }, { label: 'Account' }],
  '/settings/custom-fields': [{ label: 'Settings', href: '/settings' }, { label: 'Custom Fields' }],
  '/settings/invoice-template': [{ label: 'Settings', href: '/settings' }, { label: 'Templates' }],
  '/settings/team': [{ label: 'Settings', href: '/settings' }, { label: 'Team' }],
  '/settings/invoice': [{ label: 'Settings', href: '/settings' }, { label: 'Invoice' }],
  '/settings/payment': [{ label: 'Settings', href: '/settings' }, { label: 'Payment' }],
  '/settings/currency': [{ label: 'Settings', href: '/settings' }, { label: 'Currency' }],
  '/settings/workshop': [{ label: 'Settings', href: '/settings' }, { label: 'Workshop' }],
  '/settings/appearance': [{ label: 'Settings', href: '/settings' }, { label: 'Appearance' }],
  '/settings/email': [{ label: 'Settings', href: '/settings' }, { label: 'Email' }],
  '/settings/about': [{ label: 'Settings', href: '/settings' }, { label: 'About' }],
}

export function PageHeader() {
  const pathname = usePathname()
  const showWhiteLabelCta = useShowWhiteLabelCta()

  // Match exact route first
  let segments = breadcrumbMap[pathname]

  if (!segments) {
    // /quotes/[id]/edit
    if (/^\/quotes\/[^/]+\/edit$/.test(pathname)) {
      const quoteId = pathname.split('/')[2]
      segments = [
        { label: 'Quotes', href: '/quotes' },
        { label: 'Quote Details', href: `/quotes/${quoteId}` },
        { label: 'Edit' },
      ]
    }
    // /quotes/[id]
    else if (/^\/quotes\/[^/]+$/.test(pathname)) {
      segments = [{ label: 'Quotes', href: '/quotes' }, { label: 'Quote Details' }]
    }
    // /vehicles/[id]/service/new
    else if (/^\/vehicles\/[^/]+\/service\/new$/.test(pathname)) {
      const vehicleId = pathname.split('/')[2]
      segments = [
        { label: 'Vehicles', href: '/vehicles' },
        { label: 'Vehicle Details', href: `/vehicles/${vehicleId}` },
        { label: 'New Service Record' },
      ]
    }
    // /vehicles/[id]/service/[serviceId]
    else if (/^\/vehicles\/[^/]+\/service\/[^/]+$/.test(pathname)) {
      segments = [{ label: 'Vehicles', href: '/vehicles' }, { label: 'Service Details' }]
    }
    // /vehicles/[id]
    else if (pathname.startsWith('/vehicles/')) {
      segments = [{ label: 'Vehicles', href: '/vehicles' }, { label: 'Vehicle Details' }]
    }
    // /customers/[id]
    else if (pathname.startsWith('/customers/')) {
      segments = [{ label: 'Customers', href: '/customers' }, { label: 'Customer Details' }]
    } else {
      segments = [{ label: 'Home' }]
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
                  <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                </BreadcrumbItem>
              )
            }
            return (
              <Fragment key={i}>
                <BreadcrumbItem className="hidden md:block">
                  {segment.href ? (
                    <BreadcrumbLink href={segment.href}>{segment.label}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{segment.label}</BreadcrumbPage>
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
              Purchase White-Label
            </Link>
          </Button>
        )}
      </div>
    </header>
  )
}
