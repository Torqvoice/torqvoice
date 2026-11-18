'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useLineTax } from './LineTaxContext'

/**
 * The switch on a line for whether the document's tax is charged on it.
 *
 * Shown where the workshop taxes only some of what it charges, and on any
 * line that is already left out of the tax, so an untaxed line is never
 * invisible: a workshop that turned the setting off again can still see and
 * undo it. Everywhere else it renders nothing, and the editor looks as it
 * always has.
 */
export function LineTaxToggle({
  taxable,
  onToggle,
  disabled = false,
  className,
}: {
  /** Whether the line is taxed, with the workshop's default already applied. */
  taxable: boolean
  onToggle: () => void
  disabled?: boolean
  className?: string
}) {
  const t = useTranslations('service.lineTax')
  const { selective, untaxedDocument } = useLineTax()
  // A document with no tax rate charges no tax on any line, whatever a line says.
  if (untaxedDocument) return null
  if (!selective && taxable) return null

  return (
    <button
      type="button"
      role="switch"
      aria-checked={taxable}
      aria-label={t('label')}
      disabled={disabled}
      onClick={onToggle}
      // Says what the line is now, then that a click changes it.
      title={taxable ? t('taxedHint') : t('untaxedHint')}
      data-testid="line-tax-toggle"
      data-taxable={taxable ? 'true' : 'false'}
      className={cn(
        'h-9 shrink-0 self-start whitespace-nowrap rounded-md border px-2 text-[10px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60',
        taxable
          ? 'border-muted text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-700 hover:border-amber-500/50 hover:bg-amber-500/20 dark:text-amber-400',
        className
      )}
    >
      {taxable ? t('taxedTag') : t('untaxedTag')}
    </button>
  )
}
