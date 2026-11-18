'use client'

import { useEffect, useRef } from 'react'
import type { CalendarEvent } from '../Actions/calendarActions'
import { useEventPeek } from './EventPeek'

/**
 * Opens the card of the appointment a link asked for, once. The card is
 * anchored to a point near the top of the view rather than to the chip,
 * which knows nothing of links; closing it leaves the day on screen.
 *
 * It waits for any dialog to finish closing first: a link followed from the
 * search palette arrives while the palette hands focus back, and a card
 * opened then would close again at once. Then the link leaves the address,
 * so a refresh does not open the card a second time.
 */
export function LinkedAppointment({
  event,
  view,
  date,
}: {
  event: CalendarEvent
  view: string
  date: string
}) {
  const { openPeek } = useEventPeek()
  const anchor = useRef<HTMLSpanElement>(null)
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    const started = Date.now()
    let frame = 0
    const tryOpen = () => {
      const dialogOpen = document.querySelector('[role="dialog"]') !== null
      if (dialogOpen && Date.now() - started < 2000) {
        frame = requestAnimationFrame(tryOpen)
        return
      }
      if (opened.current || !anchor.current) return
      opened.current = true
      const params = new URLSearchParams({ view, date })
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}?${params.toString()}`
      )
      openPeek(event, anchor.current)
    }
    frame = requestAnimationFrame(tryOpen)
    return () => cancelAnimationFrame(frame)
  }, [event, view, date, openPeek])
  return (
    <span
      ref={anchor}
      aria-hidden
      className="pointer-events-none absolute top-16 left-1/2 h-0 w-0"
    />
  )
}
