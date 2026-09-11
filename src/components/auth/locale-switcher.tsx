'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setLocale } from '@/i18n/actions'
import { locales, localeNames } from '@/i18n/config'
import { cn } from '@/lib/utils'

/**
 * Language picker for the public auth pages.
 *
 * A first-time visitor has no locale cookie, so the page renders in whatever
 * Accept-Language resolved to. Somebody whose browser language we do not
 * ship, or who shares a machine, needs a way to change it before signing up,
 * and until now the only switcher sat behind the login wall.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('auth.shell')
  const locale = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Select
      value={locale}
      onValueChange={(value) => {
        startTransition(async () => {
          await setLocale(value)
          router.refresh()
        })
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={t('language')}
        disabled={pending}
        className={cn(
          'h-8 gap-1.5 border-transparent bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent',
          className
        )}
      >
        <Globe className="h-3.5 w-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {locales.map((loc) => (
          <SelectItem key={loc} value={loc}>
            {localeNames[loc]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
