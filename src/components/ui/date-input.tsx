'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Typeable date field with a calendar picker: a native date input (so dates
 * can be typed directly) plus the shadcn Calendar in a popover behind the
 * icon. Value is an ISO YYYY-MM-DD string, or '' when empty.
 */
export function DateInput({
  id,
  name,
  value,
  onChange,
  className,
}: {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(value + 'T00:00:00') : undefined

  return (
    <div className="relative w-full">
      <Input
        id={id}
        name={name}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('pr-9 [&::-webkit-calendar-picker-indicator]:hidden', className)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <CalendarIcon className="h-4 w-4" />
            <span className="sr-only">Open calendar</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              onChange(d ? toISODate(d) : '')
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
