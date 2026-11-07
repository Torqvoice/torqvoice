'use client'

import { type ReactNode, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SearchableOption {
  value: string
  label: string
  /** Extra words the search matches, such as a code, an email or a dial code. */
  keywords?: string
  /** Heading the option is listed under; options keep the order they come in. */
  group?: string
  /** A short note on the right of the option, such as where a field is already used. */
  hint?: string
  /** Shown before the label, in the list and on the button: a technician's colour, a flag. */
  icon?: ReactNode
  disabled?: boolean
}

/**
 * Ranks an option for what is typed. Whole words first, so "UK" finds the
 * United Kingdom before Ukraine; then names starting with it, words starting
 * with it, and anything containing it. No fuzzy matching: "UK" matching
 * Uzbekistan letter by letter only buries the answer.
 */
export function pickerScore(value: string, search: string): number {
  const q = search.trim().toLowerCase()
  if (!q) return 1
  const text = value.toLowerCase()
  const words = text.split(/[\s,()/-]+/)
  if (words.includes(q)) return 1
  if (text.startsWith(q)) return 0.9
  if (words.some((w) => w.startsWith(q))) return 0.7
  if (text.includes(q)) return 0.4
  return 0
}

/** Below this many options the list is short enough to read, and a search box is in the way. */
const SEARCH_FROM = 8

/**
 * The app's dropdown for a form field: a button that opens a list, with a
 * search box once the list is long enough to need one. It takes the same
 * value and onValueChange as a Select, so swapping one for the other is a
 * matter of handing it the options.
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  id,
  className,
  contentClassName,
  size = 'default',
  align = 'start',
  searchable,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: {
  value: string | null | undefined
  onValueChange: (value: string) => void
  options: readonly SearchableOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  id?: string
  className?: string
  contentClassName?: string
  size?: 'sm' | 'default'
  align?: 'start' | 'center' | 'end'
  /** Force the search box on or off; by default it shows for longer lists. */
  searchable?: boolean
  'aria-label'?: string
  'aria-invalid'?: boolean
}) {
  const t = useTranslations('common.searchableSelect')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = options.find((o) => o.value === value)
  const withSearch = searchable ?? options.length >= SEARCH_FROM

  // Options under their headings, in the order the headings first appear.
  const groups = useMemo(() => {
    const out = new Map<string, SearchableOption[]>()
    for (const option of options) {
      const key = option.group ?? ''
      const list = out.get(key)
      if (list) list.push(option)
      else out.set(key, [option])
    }
    return [...out.entries()]
  }, [options])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setSearch('')
  }

  return (
    // Modal, like a Select: inside a dialog a non-modal popover loses its wheel
    // events to the dialog's scroll lock, and a long list cannot be scrolled.
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          data-size={size}
          // The button can be narrower than the name in it; hovering shows all of it.
          title={selected?.label}
          className={cn(
            'border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-left text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8',
            className
          )}
        >
          <span
            className={cn('flex min-w-0 items-center gap-2', !selected && 'text-muted-foreground')}
          >
            {selected?.icon}
            <span className="truncate">{selected?.label ?? placeholder ?? t('choose')}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'w-(--radix-popover-trigger-width) min-w-56 max-w-[calc(100vw-2rem)] p-0',
          contentClassName
        )}
        align={align}
      >
        <Command
          // Matches what the user can read, never the value: an id would match random letters.
          filter={(_, query, keywords) => pickerScore(keywords?.join(' ') ?? '', query)}
          // Opens on the current choice, so Enter keeps it and the arrows move from it.
          defaultValue={value ?? undefined}
          // Without a search box nothing inside can take focus, and the arrow keys
          // and Enter would never reach the list: the list itself takes it instead.
          tabIndex={withSearch ? undefined : 0}
          className={withSearch ? undefined : 'outline-none'}
        >
          {withSearch && (
            <CommandInput
              placeholder={searchPlaceholder ?? t('search')}
              value={search}
              onValueChange={setSearch}
            />
          )}
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText ?? t('noMatch')}</CommandEmpty>
            {groups.map(([heading, items]) => (
              <CommandGroup key={heading || '_'} heading={heading || undefined}>
                {items.map((option) => (
                  <CommandItem
                    key={option.value}
                    // cmdk keys items by this, so it is the unique value; the
                    // search runs on the label and keywords.
                    value={option.value}
                    keywords={[option.label, option.keywords ?? '', option.group ?? '']}
                    disabled={option.disabled}
                    onSelect={() => {
                      onValueChange(option.value)
                      onOpenChange(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0',
                        option.value === value ? 'opacity-100' : 'opacity-0'
                      )}
                      aria-hidden
                    />
                    {option.icon}
                    <span className="min-w-0 flex-1 break-words">{option.label}</span>
                    {option.hint && (
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {option.hint}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
