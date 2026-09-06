'use client'

import { createContext, useContext, useEffect, useRef } from 'react'
import { adoptDetectedTimezone } from '@/features/settings/Actions/timezoneActions'
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_FORMAT } from '@/lib/format'

interface DateSettings {
  dateFormat: string
  timeFormat: '12h' | '24h'
  timezone: string
  weekStartDay: number
}

const defaultSettings: DateSettings = {
  dateFormat: DEFAULT_DATE_FORMAT,
  timeFormat: DEFAULT_TIME_FORMAT,
  timezone: '',
  weekStartDay: 1,
}

const DateSettingsContext = createContext<DateSettings>(defaultSettings)

export function DateSettingsProvider({
  dateFormat,
  timeFormat,
  timezone,
  weekStartDay,
  children,
}: {
  dateFormat?: string
  timeFormat?: string
  timezone?: string
  weekStartDay?: number
  children: React.ReactNode
}) {
  const value: DateSettings = {
    dateFormat: dateFormat || DEFAULT_DATE_FORMAT,
    timeFormat: timeFormat === '24h' ? '24h' : '12h',
    timezone: timezone || '',
    weekStartDay:
      weekStartDay != null &&
      Number.isInteger(weekStartDay) &&
      weekStartDay >= 0 &&
      weekStartDay <= 6
        ? weekStartDay
        : 1,
  }

  // A workshop with no chosen zone gets this browser's, once, as an explicit
  // setting. Server-side scheduling cannot work from "automatic". No refresh
  // afterwards: a refresh racing the first hydration is what a hydration
  // mismatch looks like, and the zone matters on the next page load anyway.
  const adopting = useRef(false)
  useEffect(() => {
    if (value.timezone || adopting.current) return
    adopting.current = true
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    const timer = setTimeout(() => {
      adoptDetectedTimezone(detected).catch(() => undefined)
    }, 1500)
    return () => clearTimeout(timer)
  }, [value.timezone])

  return <DateSettingsContext.Provider value={value}>{children}</DateSettingsContext.Provider>
}

export function useDateSettings() {
  return useContext(DateSettingsContext)
}
