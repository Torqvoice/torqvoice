'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import {
  Car,
  ClipboardCheck,
  FileQuestion,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { key: 'dashboard' as const, href: 'dashboard', icon: LayoutDashboard },
  { key: 'vehicles' as const, href: 'vehicles', icon: Car },
  { key: 'invoices' as const, href: 'invoices', icon: FileText },
  { key: 'quotes' as const, href: 'quotes', icon: FileQuestion },
  { key: 'inspections' as const, href: 'inspections', icon: ClipboardCheck },
]

export function PortalHeader({
  orgId,
  orgName,
  orgLogo,
  customerName,
}: {
  orgId: string
  orgName: string
  orgLogo?: string | null
  customerName: string
}) {
  const t = useTranslations('portal')
  const router = useRouter()
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleLogout = async () => {
    await fetch(`/api/public/portal/${orgId}/auth/logout`, { method: 'POST' })
    router.push(`/portal/${orgId}/auth/login`)
    router.refresh()
  }

  const isActive = (slug: string) => {
    const href = `/portal/${orgId}/${slug}`
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        {/* Brand */}
        <Link href={`/portal/${orgId}/dashboard`} className="flex shrink-0 items-center gap-2.5">
          {orgLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={orgLogo} alt={orgName} className="h-8 w-8 rounded object-contain" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-sm font-bold text-primary">
              {orgName.charAt(0)}
            </div>
          )}
          <span className="hidden text-sm font-semibold sm:block">{orgName}</span>
        </Link>

        {/* Desktop nav */}
        <nav className="ml-2 hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={`/portal/${orgId}/${item.href}`}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Primary CTA — visible on every screen */}
          <Button asChild size="sm" className="h-9">
            <Link href={`/portal/${orgId}/request-service`}>
              <Wrench className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">{t('nav.requestService')}</span>
              <span className="sm:hidden">{t('header.askShort')}</span>
            </Link>
          </Button>

          {/* Customer name + sign out (desktop) */}
          <div className="hidden items-center gap-2 lg:flex">
            <span className="max-w-[140px] truncate text-sm text-muted-foreground">
              {customerName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              aria-label={t('header.signOut')}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

          {/* Mobile menu */}
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <SheetTitle className="sr-only">{orgName}</SheetTitle>
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-2.5 border-b px-5 py-4">
                  {orgLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={orgLogo} alt={orgName} className="h-8 w-8 rounded object-contain" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-sm font-bold text-primary">
                      {orgName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{orgName}</p>
                    <p className="truncate text-xs text-muted-foreground">{customerName}</p>
                  </div>
                </div>
                <nav className="flex flex-1 flex-col gap-1 p-3">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={`/portal/${orgId}/${item.href}`}
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                        isActive(item.href)
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {t(`nav.${item.key}`)}
                    </Link>
                  ))}
                  <Link
                    href={`/portal/${orgId}/request-service`}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'mt-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                      isActive('request-service')
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Wrench className="h-4 w-4" />
                    {t('nav.requestService')}
                  </Link>
                </nav>
                <div className="border-t p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setDrawerOpen(false)
                      handleLogout()
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('header.signOut')}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
