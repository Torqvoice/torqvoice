'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BOOKING_EVENT, type BookingStart, useBookingAccess } from '@/components/booking-launcher'
import { useDateSettings } from '@/components/date-settings-context'
import { zonedDayKey } from '@/lib/timezone'
import { BookingDialog } from './BookingDialog'

/** The next full hour on the workshop's clock: a booking made now is for later. */
function nextHour(timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(
      new Date()
    )
  )
  return `${String(Math.min(hour + 1, 23)).padStart(2, '0')}:00`
}

/**
 * The booking dialog for every screen but the calendar, which has its own.
 *
 * Mounted once in the layout and opened by `openBooking`, with the vehicle
 * and customer the asker already has. It starts on the workshop's today at
 * the next full hour; the day and time are the first thing the dialog asks.
 */
export function BookingHost() {
  const { canBook } = useBookingAccess()
  const { timezone } = useDateSettings()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState<BookingStart | null>(null)
  const [today, setToday] = useState('')
  const [time, setTime] = useState('09:00')
  // A new opening is a new booking, even with the same vehicle as the last.
  const [opening, setOpening] = useState(0)

  useEffect(() => {
    if (!canBook) return
    const onEvent = (e: Event) => {
      setStart((e as CustomEvent<BookingStart>).detail ?? null)
      // The workshop's day, not the browser's or the server's.
      setToday(zonedDayKey(new Date(), timezone || 'UTC'))
      setTime(nextHour(timezone || 'UTC'))
      setOpening((n) => n + 1)
      setOpen(true)
    }
    document.addEventListener(BOOKING_EVENT, onEvent)
    return () => document.removeEventListener(BOOKING_EVENT, onEvent)
  }, [canBook, timezone])

  if (!canBook) return null

  return (
    <BookingDialog
      key={opening}
      open={open}
      onOpenChange={setOpen}
      defaultDate={today}
      defaultTime={time}
      start={start}
      calendarLink
      onSaved={() => router.refresh()}
    />
  )
}
