'use client'

import { LogOut, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

/** "Kari Nordmann" -> "KN", "Cher" -> "C". Empty when there is no name. */
export function customerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0].charAt(0)
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : ''
  return (first + last).toUpperCase()
}

/**
 * The customer's own button in the header: their initials, and behind it who
 * is signed in and the way out. Shared by every theme's Chrome; its shape and
 * colours come from the theme's variables.
 *
 * The menu is drawn in place, not moved to <body>, so it keeps the theme. It
 * closes on Escape (focus goes back to the button), on a click elsewhere and
 * when focus leaves it.
 */
export function PortalAccountMenu({
  orgParam,
  customerName,
  className,
}: {
  orgParam: string
  customerName: string
  className?: string
}) {
  const t = useTranslations('portal.header')
  const router = useRouter()
  const menuId = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const firstItem = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const initials = customerInitials(customerName)

  useEffect(() => {
    if (!open) return
    firstItem.current?.focus()
    const outside = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const signOut = async () => {
    setLeaving(true)
    // Signed out or not, the sign-in page is where this ends: it sends a
    // customer who is still signed in straight back.
    await fetch(`/portal/${orgParam}/auth/logout`, { method: 'POST' }).catch(() => null)
    router.push(`/portal/${orgParam}/auth/login`)
    router.refresh()
  }

  return (
    <div
      ref={wrap}
      className={className ? `relative ${className}` : 'relative'}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="p-iconbtn"
        aria-label={t('account', { name: customerName })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {initials || <User className="h-[18px] w-[18px]" aria-hidden />}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="p-menu"
          aria-label={t('account', { name: customerName })}
        >
          <div className="px-3 pb-2 pt-1.5">
            <span className="p-muted block text-xs">{t('signedInAs')}</span>
            <span className="block text-[15px] font-semibold">{customerName}</span>
          </div>
          <button
            ref={firstItem}
            type="button"
            role="menuitem"
            className="p-menu__item"
            disabled={leaving}
            onClick={signOut}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {t('signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
