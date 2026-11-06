'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
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
import { MAKES, type Make, makeKey } from '../Lib/makes'

export type PickedMake = { key: string; name: string }

/**
 * The make an import is for: type a few letters and pick it from the list, cars first for a
 * workshop that fixes cars and outboards first for a marine one. A make that is not listed is
 * used as typed. The same Popover and Command picker as the app's other searchable fields.
 */
export function MakeCombobox({
  value,
  onChange,
  marine,
  id,
}: {
  value: PickedMake | null
  onChange: (make: PickedMake) => void
  marine: boolean
  id?: string
}) {
  const t = useTranslations('faultCodes.import')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const typed = search.trim()
  const typedKey = typed ? makeKey(typed) : null
  // A listed make that has the typed letters in its name; only without one is the typed
  // name offered as a make of its own, so Enter on a half-typed name never makes one up.
  const lower = typed.toLowerCase()
  const listed = MAKES.some(
    (m) => m.name.toLowerCase().includes(lower) || (typedKey !== null && m.key.includes(typedKey))
  )
  const groups: { label: string; makes: Make[] }[] = [
    { label: t('groups.cars'), makes: MAKES.filter((m) => !m.marine) },
    { label: t('groups.marine'), makes: MAKES.filter((m) => m.marine) },
  ]
  if (marine) groups.reverse()

  const pick = (make: PickedMake) => {
    onChange(make)
    setSearch('')
    setOpen(false)
  }

  return (
    // Modal: inside the import dialog a non-modal popover's wheel events are swallowed by the
    // dialog's scroll lock, and the list cannot be scrolled.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value?.name ?? t('pickMake')}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command
          filter={(value, query) =>
            value.toLowerCase().includes(query.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={t('searchMake')} value={search} onValueChange={setSearch} />
          <CommandList>
            {!typedKey && (
              <CommandEmpty>
                <span className="text-xs text-muted-foreground">{t('noMake')}</span>
              </CommandEmpty>
            )}
            {groups.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.makes.map((m) => (
                  <CommandItem
                    key={m.key}
                    value={`${m.name} ${m.key}`}
                    onSelect={() => pick({ key: m.key, name: m.name })}
                  >
                    <Check
                      className={cn('size-3.5', value?.key === m.key ? 'opacity-100' : 'opacity-0')}
                      aria-hidden
                    />
                    {m.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {typedKey && !listed && (
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  value={`use:${typed}`}
                  onSelect={() => pick({ key: typedKey, name: typed })}
                >
                  <Plus className="size-3.5" aria-hidden />
                  {t('useMake', { name: typed })}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
