'use client'

import { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateSettings } from '@/components/date-settings-context'
import { formatDate as formatWithOrgPattern } from '@/lib/format'

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Parse typed text into a Date. Numeric inputs (25.05.2026, 25/05/2026,
 * 2026-05-25) accept dot/slash/dash/space separators; day-vs-month order
 * follows the workshop date format when ambiguous, and a value over 12 is
 * always taken as the day. Anything else falls back to new Date() parsing
 * ("February 01, 2001", "March 15 2025").
 */
function parseDateText(raw: string, dateFormat: string): Date | undefined {
  const text = raw.trim()
  if (!text) return undefined

  const m = text.match(/^(\d{1,4})[./\-\s](\d{1,2})[./\-\s](\d{1,4})$/)
  if (m) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])]
    let year: number
    let month: number
    let day: number
    if (m[1].length === 4) {
      // Year first: 2026-05-25
      year = a
      month = b
      day = c
    } else {
      year = c < 100 ? 2000 + c : c
      const monthFirst = dateFormat.trimStart().startsWith('M')
      if (a > 12 && b <= 12) {
        day = a
        month = b
      } else if (b > 12 && a <= 12) {
        day = b
        month = a
      } else if (monthFirst) {
        month = a
        day = b
      } else {
        day = a
        month = b
      }
    }
    const d = new Date(year, month - 1, day)
    // Reject overflowed dates like 32.13.2026
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
      ? d
      : undefined
  }

  const d = new Date(text)
  return isNaN(d.getTime()) ? undefined : d
}

/**
 * Typeable date field with a calendar picker (shadcn date picker "Input"
 * pattern). Displays and parses using the workshop date format setting.
 * The external value is an ISO YYYY-MM-DD string ('' when empty); when
 * `name` is set, a hidden input carries the ISO value for form submission.
 */
export function DateInput({
  id,
  name,
  value,
  onChange,
  className,
  placeholder,
}: {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}) {
  const { dateFormat } = useDateSettings()
  const display = (d: Date | undefined) => (d ? formatWithOrgPattern(d, dateFormat) : '')

  const [open, setOpen] = useState(false)
  const initial = value ? new Date(value + 'T00:00:00') : undefined
  const [text, setText] = useState(display(initial))
  const [month, setMonth] = useState<Date | undefined>(initial)
  // Tracks the last ISO value this component emitted, so external value
  // changes (reload, reset) update the text without clobbering typing.
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      const d = value ? new Date(value + 'T00:00:00') : undefined
      setText(display(d))
      setMonth(d)
      lastEmitted.current = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const parsed = parseDateText(raw, dateFormat)
    if (parsed) {
      emit(toISODate(parsed))
      setMonth(parsed)
    }
  }

  const handleBlur = () => {
    // Normalize to the display format, or clear leftover unparseable text
    const d = value ? new Date(value + 'T00:00:00') : undefined
    setText(display(d))
  }

  const selected = value ? new Date(value + 'T00:00:00') : undefined

  return (
    <div className="relative w-full">
      {name && <input type="hidden" name={name} value={value} />}
      <Input
        id={id}
        value={text}
        placeholder={placeholder ?? display(new Date())}
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
                setText(display(d))
              }
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
