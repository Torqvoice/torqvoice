'use client'

import { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDisplay(date: Date | undefined): string {
  if (!date) return ''
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })
}

function isValidDate(date: Date | undefined): boolean {
  return !!date && !isNaN(date.getTime())
}

/**
 * Typeable date field with a calendar picker, following shadcn's date picker
 * "Input" example: free-text typing parsed via new Date() (so "March 15 2025",
 * "2025-03-15" and "03/15/2025" all work) plus the Calendar in a popover.
 * The external value is an ISO YYYY-MM-DD string ('' when empty); when `name`
 * is set, a hidden input carries the ISO value for form submission.
 */
export function DateInput({
  id,
  name,
  value,
  onChange,
  className,
  placeholder = 'June 01, 2025',
}: {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const initial = value ? new Date(value + 'T00:00:00') : undefined
  const [text, setText] = useState(formatDisplay(initial))
  const [month, setMonth] = useState<Date | undefined>(initial)
  // Tracks the last ISO value this component emitted, so external value
  // changes (reload, reset) update the text without clobbering typing.
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      const d = value ? new Date(value + 'T00:00:00') : undefined
      setText(formatDisplay(d))
      setMonth(d)
      lastEmitted.current = value
    }
  }, [value])

  const emit = (iso: string) => {
    lastEmitted.current = iso
    onChange(iso)
  }

  const handleTextChange = (raw: string) => {
    setText(raw)
    if (!raw.trim()) {
      emit('')
      return
    }
    const parsed = new Date(raw)
    if (isValidDate(parsed)) {
      emit(toISODate(parsed))
      setMonth(parsed)
    }
  }

  const handleBlur = () => {
    // Normalize to the display format, or clear leftover unparseable text
    const d = value ? new Date(value + 'T00:00:00') : undefined
    setText(formatDisplay(d))
  }

  const selected = value ? new Date(value + 'T00:00:00') : undefined

  return (
    <div className="relative w-full">
      {name && <input type="hidden" name={name} value={value} />}
      <Input
        id={id}
        value={text}
        placeholder={placeholder}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn('pr-9', className)}
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
            month={month}
            onMonthChange={setMonth}
            onSelect={(d) => {
              if (d) {
                emit(toISODate(d))
                setText(formatDisplay(d))
              }
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
