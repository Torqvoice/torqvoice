'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import type { SettingOption } from '@/features/integrations/Lib/types'

/**
 * A picker for a list the vendor supplies: products, tax codes, accounts. A
 * company can have hundreds, so it searches as you type. An optional setting
 * gets a first entry that leaves it empty; a required one, such as which
 * calendar to write to, does not offer that, since nothing works without it.
 */
export function OptionPicker({
  value,
  options,
  onChange,
  disabled,
  required = false,
}: {
  value: string
  /** undefined while the list is still loading. */
  options: SettingOption[] | null | undefined
  onChange: (value: string) => void
  disabled?: boolean
  /** Whether the setting must have a value; hides the entry that clears it. */
  required?: boolean
}) {
  const t = useTranslations('integrations')
  const [open, setOpen] = useState(false)
  const loading = options === undefined
  const chosen = options?.find((o) => o.value === value) ?? null
  // A value the list no longer has (a deleted item, a code from another
  // company) still shows, so the workshop sees something is set.
  const label = chosen?.label ?? (value ? value : null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="h-8 w-full justify-between font-normal"
          // The button is narrow and cuts a long name short; hovering shows all of it.
          title={label ?? undefined}
        >
          <span className={cn('truncate', !label && 'text-muted-foreground')}>
            {loading ? t('connection.loading') : (label ?? t('connection.choose'))}
          </span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      {/* As wide as its longest entry, within the screen: an account is told
          apart by the end of its name, which a list the width of the button cut off. */}
      <PopoverContent
        className="w-max min-w-[max(16rem,var(--radix-popover-trigger-width))] max-w-[min(32rem,calc(100vw-2rem))] p-0"
        align="end"
      >
        <Command>
          <CommandInput placeholder={t('connection.search')} />
          <CommandList>
            <CommandEmpty>{t('connection.noMatch')}</CommandEmpty>
            <CommandGroup>
              {!required && (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange('')
                    setOpen(false)
                  }}
                  className="text-muted-foreground"
                >
                  <Check className={cn('mr-2 h-4 w-4', value ? 'opacity-0' : 'opacity-100')} />
                  {t('connection.leaveEmpty')}
                </CommandItem>
              )}
              {(options ?? []).map((o) => (
                <CommandItem
                  key={o.value}
                  // cmdk matches on this, so search covers the label, not the id.
                  value={`${o.label} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      o.value === value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="min-w-0 break-words">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
