'use client'

import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
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
import {
  IMPERIAL_MEASUREMENT_UNITS,
  METRIC_MEASUREMENT_UNITS,
} from '@/features/inventory/Lib/units'
import { cn } from '@/lib/utils'

/**
 * Searchable unit-of-measure picker: the same Popover + Command combobox the
 * category field uses, so both feel identical. Suggestions come grouped —
 * localized count units, then the workshop's own measurement system, then the
 * other system — and anything typed that matches nothing becomes a free-text
 * unit, because these lists are suggestions, not a taxonomy.
 */
export function UnitCombobox({
  value,
  onChange,
  unitSystem,
  id,
  className,
}: {
  value: string
  onChange: (value: string) => void
  /** workshop.unitSystem — anything other than "imperial" is treated as metric. */
  unitSystem?: string
  id?: string
  className?: string
}) {
  const t = useTranslations('inventory')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const countUnits = t('form.unitSuggestions')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  const imperialFirst = unitSystem === 'imperial'
  const groups: { label: string; units: readonly string[] }[] = [
    { label: t('form.unitGroupCount'), units: countUnits },
    ...(imperialFirst
      ? [
          { label: t('form.unitGroupImperial'), units: IMPERIAL_MEASUREMENT_UNITS },
          { label: t('form.unitGroupMetric'), units: METRIC_MEASUREMENT_UNITS },
        ]
      : [
          { label: t('form.unitGroupMetric'), units: METRIC_MEASUREMENT_UNITS },
          { label: t('form.unitGroupImperial'), units: IMPERIAL_MEASUREMENT_UNITS },
        ]),
  ]
  const known = new Set(groups.flatMap((g) => [...g.units].map((u) => u.toLowerCase())))
  const trimmed = search.trim()

  const pick = (unit: string) => {
    // Re-selecting the current unit clears it, same as the category picker.
    onChange(unit === value ? '' : unit)
    setSearch('')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('h-9 w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value || t('form.unitPlaceholder')}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={t('form.unitSearch')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {trimmed ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                  onClick={() => pick(trimmed)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('form.unitCreate', { name: trimmed })}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">{t('form.unitPlaceholder')}</span>
              )}
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.units.map((unit) => (
                  <CommandItem key={unit} value={unit} onSelect={() => pick(unit)}>
                    <Check
                      className={cn(
                        'mr-2 h-3.5 w-3.5',
                        value === unit ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {unit}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {trimmed && !known.has(trimmed.toLowerCase()) && (
              <CommandGroup>
                <CommandItem value={`__use__${trimmed}`} onSelect={() => pick(trimmed)}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  {t('form.unitCreate', { name: trimmed })}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
