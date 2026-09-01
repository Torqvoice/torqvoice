'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  rankSuggestions,
  type DefectSeverity,
  type DefectSuggestion,
  type SuggestionCheck,
} from '../Lib/defectCatalogue'
import { CONDITION_TOKENS, type Condition, type SeverityScale } from '../Lib/conditions'
import { useConditionLabels } from '../Lib/useConditionLabels'

/** How many phrases sit inline before the rest move into the search popover. */
const INLINE_LIMIT = 5

function SeverityDot({ severity }: { severity: DefectSeverity }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${CONDITION_TOKENS[severity].bar}`}
      aria-hidden="true"
    />
  )
}

/**
 * Ready-made defect wording for a check.
 *
 * Each phrase shows the grade it will apply, because picking one both writes
 * the note and sets the grade — the Directive ties the two together, and a
 * control that silently changed the grade would be a nasty surprise. Showing
 * the grade up front means the technician chooses it knowingly.
 */
export function DefectSuggestions({
  check,
  scale,
  currentCondition,
  history,
  disabled,
  onPick,
}: {
  check: SuggestionCheck
  scale: SeverityScale
  currentCondition: Condition
  history?: { text: string; severity: string }[]
  disabled?: boolean
  onPick: (suggestion: DefectSuggestion) => void
}) {
  const t = useTranslations('inspections.suggestions')
  const sourceLabel = (source: DefectSuggestion['source']) => t(`source.${source}`)
  const { label: gradeLabel } = useConditionLabels(scale)
  const [open, setOpen] = useState(false)

  const suggestions = useMemo(
    () =>
      rankSuggestions(check, {
        scale,
        preferred: currentCondition,
        history: (history ?? [])
          .filter(
            (h): h is { text: string; severity: DefectSeverity } =>
              h.severity === 'attention' || h.severity === 'fail' || h.severity === 'dangerous'
          )
          .map((h) => ({ text: h.text, severity: h.severity })),
      }),
    [check, scale, currentCondition, history]
  )

  if (suggestions.length === 0) return null

  const inline = suggestions.slice(0, INLINE_LIMIT)
  const hasMore = suggestions.length > inline.length

  const pick = (suggestion: DefectSuggestion) => {
    onPick(suggestion)
    setOpen(false)
  }

  return (
    <div className="mt-2">
      <p className="text-muted-foreground text-xs" id={`${check.name}-suggestions-label`}>
        {t('title')}
      </p>
      <div
        role="group"
        aria-labelledby={`${check.name}-suggestions-label`}
        className="mt-1 flex flex-wrap gap-1.5"
      >
        {inline.map((suggestion) => (
          <button
            key={`${suggestion.source}-${suggestion.text}`}
            type="button"
            disabled={disabled}
            onClick={() => pick(suggestion)}
            aria-label={t('add', { text: suggestion.text, grade: gradeLabel(suggestion.severity) })}
            title={sourceLabel(suggestion.source)}
            className="bg-background hover:bg-muted focus-visible:ring-ring inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            <SeverityDot severity={suggestion.severity} />
            <span className="truncate">{suggestion.text}</span>
          </button>
        ))}

        {hasMore && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="h-[30px] rounded-full px-2.5 text-xs"
              >
                <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                {t('more', { count: suggestions.length - inline.length })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
              <Command>
                <CommandInput placeholder={t('search')} />
                <CommandList>
                  <CommandEmpty>{t('empty')}</CommandEmpty>
                  {(['workshop', 'history', 'regulation', 'general'] as const).map((source) => {
                    const group = suggestions.filter((s) => s.source === source)
                    if (group.length === 0) return null
                    return (
                      <CommandGroup key={source} heading={sourceLabel(source)}>
                        {group.map((suggestion) => (
                          <CommandItem
                            key={`${source}-${suggestion.text}`}
                            value={suggestion.text}
                            onSelect={() => pick(suggestion)}
                            className="gap-2"
                          >
                            <SeverityDot severity={suggestion.severity} />
                            <span className="flex-1">{suggestion.text}</span>
                            <span className="text-muted-foreground shrink-0 text-xs">
                              {gradeLabel(suggestion.severity)}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )
                  })}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}
