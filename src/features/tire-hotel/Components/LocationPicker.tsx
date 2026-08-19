'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
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
import { Check, ChevronsUpDown, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OCCUPANCY_TOKENS } from '../Lib/tireConstants'
import { partitionByRoom, type LocationCapacity } from '../Lib/capacity'

export type PickerLocation = LocationCapacity & {
  warehouseId: string
  warehouseName: string
}

/**
 * Choosing where a set goes.
 *
 * The picker's job is to answer "will this fit" before the technician commits,
 * so every row carries its free-tire count and the shelves that cannot take
 * the set stay visible but disabled. Hiding them would leave someone hunting
 * for a shelf they can see across the room.
 *
 * Suggestions are ordered tightest-fit-first, which keeps storage dense
 * instead of opening a new shelf for every arrival.
 */
export function LocationPicker({
  locations,
  value,
  onChange,
  quantity,
  disabled,
}: {
  locations: PickerLocation[]
  value: string | null
  onChange: (locationId: string | null) => void
  quantity: number
  disabled?: boolean
}) {
  const t = useTranslations('tireHotel')
  const [open, setOpen] = useState(false)

  const { fits, tooFull } = useMemo(
    () => partitionByRoom<PickerLocation>(locations, quantity),
    [locations, quantity]
  )

  const selected = locations.find((l) => l.id === value) ?? null
  const totalFree = fits.reduce((sum, l) => sum + l.free, 0)

  // Group the usable shelves by warehouse so a multi-site operator reads the
  // list the way the buildings are laid out.
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: PickerLocation[] }>()
    for (const location of fits) {
      const entry = map.get(location.warehouseId) ?? { name: location.warehouseName, items: [] }
      entry.items.push(location)
      map.set(location.warehouseId, entry)
    }
    return [...map.values()]
  }, [fits])

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-mono font-medium">{selected.code}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {selected.warehouseName}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">{t('checkIn.choosePlace')}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={t('checkIn.searchLocations')} />
            <CommandList>
              <CommandEmpty>{t('checkIn.noLocations')}</CommandEmpty>

              {grouped.map((group) => (
                <CommandGroup key={group.name} heading={group.name}>
                  {group.items.map((location) => (
                    <CommandItem
                      key={location.id}
                      value={`${location.code} ${location.warehouseName}`}
                      onSelect={() => {
                        onChange(location.id)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === location.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="flex-1 font-mono">{location.code}</span>
                      <span
                        className={cn(
                          'text-xs font-medium tabular-nums',
                          OCCUPANCY_TOKENS[location.band].text
                        )}
                      >
                        {t('capacity.freeShort', { count: location.free })}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {tooFull.length > 0 && (
                <CommandGroup heading={t('checkIn.tooFull')}>
                  {tooFull.slice(0, 12).map((location) => (
                    <CommandItem
                      key={location.id}
                      value={`${location.code} ${location.warehouseName}`}
                      disabled
                      className="opacity-50"
                    >
                      <span className="mr-2 h-4 w-4" />
                      <span className="flex-1 font-mono">{location.code}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {t('capacity.freeShort', { count: location.free })}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Standing answer to "is there room", so nobody has to open the picker
          to find out the building is full. */}
      {fits.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-amber-600">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {t('checkIn.nothingFits', { quantity })}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground tabular-nums">
          {t('checkIn.roomSummary', { locations: fits.length, tires: totalFree })}
        </p>
      )}
    </div>
  )
}
