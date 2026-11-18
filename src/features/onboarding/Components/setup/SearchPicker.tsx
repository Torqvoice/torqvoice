'use client'

import { Check, ChevronDown } from 'lucide-react'
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
import { pickerScore } from '@/components/ui/searchable-select'
import { cn } from '@/lib/utils'

export interface PickerOption {
  value: string
  label: string
  /** Extra words the search matches, such as a currency's code. */
  keywords?: string
}

// Shared with the app's dropdown; still exported here for the code that imports it from here.
export { pickerScore }

/** A searchable list behind a button, for long lists: countries, currencies, zones. */
export function SearchPicker({
  id,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  empty,
  icon,
  className,
  disabled,
}: {
  id?: string
  value: string | null
  options: PickerOption[]
  onChange: (value: string) => void
  placeholder: string
  searchPlaceholder: string
  empty: string
  icon?: React.ReactNode
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          disabled={disabled}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'h-11 w-full justify-between bg-background px-3.5 text-[15px] font-normal',
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {icon}
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected?.label ?? placeholder}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command filter={pickerScore}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{empty}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.keywords ?? ''} ${option.value}`}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                    aria-hidden="true"
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
