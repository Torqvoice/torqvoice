'use client'

import { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useDateSettings } from '@/components/date-settings-context'
import { formatDate as formatWithOrgPattern } from '@/lib/format'
import { parseDateText, toISODate } from '@/lib/parse-date-text'
import { dayKeyToLocalDate, workshopTodayKey } from '@/lib/workshop-datetime'

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
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  'aria-invalid'?: boolean
  /** The id of the message that explains why the value is refused. */
  'aria-describedby'?: string
}) {
  const { dateFormat, timezone } = useDateSettings()
  const ta = useTranslations('common.a11y')
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
        // The workshop's today, the same on the server (UTC) and in the browser.
        placeholder={placeholder ?? display(dayKeyToLocalDate(workshopTodayKey(timezone)))}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn('pr-9', className)}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
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
            <span className="sr-only">{ta('openCalendar')}</span>
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
