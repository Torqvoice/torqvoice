'use client'

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
import { Zap } from 'lucide-react'
import { useShowWhiteLabelCta } from '@/components/white-label-cta-context'

const breadcrumbMap: Record<string, { parent?: string; parentHref?: string; label: string }> = {
  '/': { label: 'Dashboard' },
  '/vehicles': { parent: 'Vehicles', parentHref: '/vehicles', label: 'All Vehicles' },
  '/customers': { parent: 'Customers', parentHref: '/customers', label: 'All Customers' },
  '/work-orders': { parent: 'Work Orders', parentHref: '/work-orders', label: 'All Work Orders' },
  '/quotes': { parent: 'Quotes', parentHref: '/quotes', label: 'All Quotes' },
  '/quotes/new': { parent: 'Quotes', parentHref: '/quotes', label: 'New Quote' },
  '/billing': { parent: 'Billing', parentHref: '/billing', label: 'Billing History' },
  '/inventory': { parent: 'Inventory', parentHref: '/inventory', label: 'All Parts' },
  '/reports': { parent: 'Reports', parentHref: '/reports', label: 'Reports' },
  '/admin': { label: 'Admin Overview' },
  '/admin/users': { parent: 'Admin', parentHref: '/admin', label: 'Users' },
  '/admin/organizations': { parent: 'Admin', parentHref: '/admin', label: 'Organizations' },

  '/admin/settings': { parent: 'Admin', parentHref: '/admin', label: 'Settings' },
  '/settings': { label: 'Settings' },
  '/settings/company': { parent: 'Settings', parentHref: '/settings', label: 'Company' },
  '/settings/account': { parent: 'Settings', parentHref: '/settings', label: 'Account' },
  '/settings/custom-fields': {
    parent: 'Settings',
    parentHref: '/settings',
    label: 'Custom Fields',
  },
  '/settings/invoice-template': { parent: 'Settings', parentHref: '/settings', label: 'Templates' },
  '/settings/team': { parent: 'Settings', parentHref: '/settings', label: 'Team' },
  '/settings/invoice': { parent: 'Settings', parentHref: '/settings', label: 'Invoice' },
  '/settings/payment': { parent: 'Settings', parentHref: '/settings', label: 'Payment' },
  '/settings/currency': { parent: 'Settings', parentHref: '/settings', label: 'Currency' },
  '/settings/workshop': { parent: 'Settings', parentHref: '/settings', label: 'Workshop' },
  '/settings/appearance': { parent: 'Settings', parentHref: '/settings', label: 'Appearance' },
  '/settings/about': { parent: 'Settings', parentHref: '/settings', label: 'About' },
}

export function PageHeader() {
  const pathname = usePathname()
  const showWhiteLabelCta = useShowWhiteLabelCta()

  // Match exact route first
  let crumb = breadcrumbMap[pathname]

  if (!crumb) {
    // /quotes/[id]/edit
    if (/^\/quotes\/[^/]+\/edit$/.test(pathname)) {
      crumb = { parent: 'Quotes', parentHref: '/quotes', label: 'Edit Quote' }
    }
    // /quotes/[id]
    else if (/^\/quotes\/[^/]+$/.test(pathname)) {
      crumb = { parent: 'Quotes', parentHref: '/quotes', label: 'Quote Details' }
    }
    // /vehicles/[id]/service/new
    else if (/^\/vehicles\/[^/]+\/service\/new$/.test(pathname)) {
      crumb = { parent: 'Vehicles', parentHref: '/vehicles', label: 'New Service Record' }
    }
    // /vehicles/[id]/service/[serviceId]
    else if (/^\/vehicles\/[^/]+\/service\/[^/]+$/.test(pathname)) {
      crumb = { parent: 'Vehicles', parentHref: '/vehicles', label: 'Service Details' }
    }
    // /vehicles/[id]
    else if (pathname.startsWith('/vehicles/')) {
      crumb = { parent: 'Vehicles', parentHref: '/vehicles', label: 'Vehicle Details' }
    }
    // /customers/[id]
    else if (pathname.startsWith('/customers/')) {
      crumb = { parent: 'Customers', parentHref: '/customers', label: 'Customer Details' }
    } else {
      crumb = { label: 'Home' }
    }
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumb.parent && crumb.parentHref && (
            <>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href={crumb.parentHref}>{crumb.parent}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {showWhiteLabelCta && (
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href="/settings/license">
            <Zap className="mr-2 h-3 w-3" />
            Purchase White-Label
          </Link>
        </Button>
      )}
    </header>
  )
}
