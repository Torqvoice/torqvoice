'use client'

import { useTranslations } from 'next-intl'
import { BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Link from a page, card or dialog to the matching documentation page.
 *
 * `href` is a docs path without a locale (`/docs/features/inventory`). The docs
 * site resolves the reader's own language, so a locale here would pin them to
 * ours. Never append a heading anchor either: heading slugs are translated, so
 * an English one does not exist on a localized page.
 */
export function DocsLink({
  href,
  className,
  variant = 'inline',
}: {
  href: string
  className?: string
  /** `inline` sits beside a heading; `hint` sits under dialog text with an icon. */
  variant?: 'inline' | 'hint'
}) {
  const t = useTranslations('navigation')

  return (
    <a
      href={`https://torqvoice.com${href}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        variant === 'hint' ? 'inline-flex items-center gap-1.5 text-xs' : 'text-[11px]',
        className
      )}
    >
      {variant === 'hint' && <BookOpen className="h-3.5 w-3.5" />}
      {t('readMore')} →
    </a>
  )
}
