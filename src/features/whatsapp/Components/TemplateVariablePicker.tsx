'use client'

import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TEMPLATE_TOKENS, parseTemplateTokens, type TemplateToken } from '../Schema/templateTokens'

/**
 * Picks which values fill a template's blanks, in order.
 *
 * Typed free-hand this is a trap: the words are ours, they are stored verbatim,
 * and "custommer" fails silently at send time inside WhatsApp rather than here.
 * Chips make the vocabulary the only thing that can be entered.
 *
 * Order carries the meaning, so each chip shows the blank it fills.
 */
export function TemplateVariablePicker({
  value,
  onChange,
  offered = TEMPLATE_TOKENS,
}: {
  /** Comma-separated tokens, exactly as stored. */
  value: string
  onChange: (next: string) => void
  /** Narrowed when a provider handles some of them itself. */
  offered?: readonly TemplateToken[]
}) {
  const t = useTranslations('whatsapp.settings.template')
  const selected = parseTemplateTokens(value)

  const commit = (tokens: TemplateToken[]) => onChange(tokens.join(', '))

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2',
          selected.length === 0 && 'text-muted-foreground'
        )}
      >
        {selected.length === 0 ? (
          <span className="px-1 text-xs">{t('variablesEmpty')}</span>
        ) : (
          selected.map((token, index) => (
            <span
              // The same token may legitimately fill two blanks, so position is
              // part of what identifies a chip.
              key={`${token}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 py-1 pl-2 pr-1 text-xs font-medium text-primary"
            >
              <span className="font-mono text-[11px] opacity-60">{`{{${index + 1}}}`}</span>
              {token}
              <button
                type="button"
                onClick={() => commit(selected.filter((_, at) => at !== index))}
                className="rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
                aria-label={t('variablesRemove', { name: token })}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {offered.map((token) => (
          <button
            key={token}
            type="button"
            onClick={() => commit([...selected, token])}
            className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="h-3 w-3" />
            {token}
            <span className="text-muted-foreground">· {t(`tokens.${token}`)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
