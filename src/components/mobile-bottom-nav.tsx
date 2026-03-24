'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Car, ClipboardList, Menu, Package, Users } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/vehicles', icon: Car, labelKey: 'vehicles' },
  { href: '/work-orders', icon: ClipboardList, labelKey: 'workOrders' },
  { href: '/customers', icon: Users, labelKey: 'customers' },
  { href: '/inventory', icon: Package, labelKey: 'inventory' },
] as const

export function MobileBottomNav() {
  const pathname = usePathname()
  const t = useTranslations('navigation.sidebar')
  const { setOpenMobile } = useSidebar()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid grid-cols-5">
        {navItems.map(({ href, icon: Icon, labelKey }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 text-[10px]',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{t(labelKey)}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          <span>{t('more')}</span>
        </button>
      </div>
    </nav>
  )
}
