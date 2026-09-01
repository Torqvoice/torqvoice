'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, ChevronsUpDown } from 'lucide-react'
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
import { countriesFor } from '@/features/team/Lib/dialCodes'

/**
 * Picking a country out of forty, without scrolling through forty.
 *
 * A plain select was the wrong control for this: it resizes as it scrolls,
 * it cannot be typed into, and finding Lithuania meant dragging past thirty
 * countries nobody in that workshop will ever choose. Anything with this many
 * options and one obvious answer wants a search box.
 *
 * Matching is by name and by dial code, so both "norw" and "47" land on
 * Norway, and by region code so a keyboard-first user can type NO.
 */
export function CountryPicker({
  value,
  onChange,
  disabled,
}: {
  /** ISO region code, not a dial code: Canada and the US are both +1. */
  value: string
  onChange: (region: string) => void
  disabled?: boolean
}) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const [open, setOpen] = useState(false)

  const countries = useMemo(() => countriesFor(locale), [locale])
  const selected = countries.find((c) => c.region === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          // A button by construction; the role is what tells a screen reader
          // that a listbox opens from it.
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span>
              {selected.name} <span className="text-muted-foreground">({selected.dial})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t('team.workshopCountryPlaceholder')}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      {/* Fixed height, so the list does not grow and shrink as it scrolls. */}
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={t('team.countrySearch')} />
          <CommandList className="max-h-64">
            <CommandEmpty>{t('team.countryNoMatch')}</CommandEmpty>
            <CommandGroup>
              {countries.map((c) => (
                <CommandItem
                  key={c.region}
                  // What cmdk filters on. The dial code and the region are in
                  // here so typing 47 or NO finds Norway, not only "norw".
                  value={`${c.name} ${c.dial} ${c.region}`}
                  onSelect={() => {
                    onChange(c.region)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', c.region === value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="flex-1">{c.name}</span>
                  <span className="text-muted-foreground text-xs">{c.dial}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
