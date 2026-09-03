'use client'

import { useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CalendarCheck, CalendarX, Loader2, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  type BookingPage,
  cancelBooking,
  confirmBooking,
  getBookingPage,
} from '@/features/inspection-reminders/Actions/bookingActions'

/**
 * One screen, no account: the first free time as the big button, a
 * calendar of the weeks after it for anyone who wants a different day,
 * then a confirmation. The same page shows and cancels an existing booking.
 */
export function BookingClient({ token, initial }: { token: string; initial: BookingPage }) {
  const t = useTranslations('portal.booking')
  const format = useFormatter()
  const [page, setPage] = useState(initial)
  const [day, setDay] = useState<string | null>(null)
  const [start, setStart] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'full', timeStyle: 'short' })
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: 'short' })
  const dayLabel = (key: string) =>
    format.dateTime(new Date(`${key}T12:00:00`), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })

  const openDays = useMemo(() => page.days.filter((d) => d.status !== 'closed'), [page.days])
  const chosenDay = day ? page.days.find((d) => d.date === day) : null

  const refresh = async () => {
    const next = await getBookingPage(token).catch(() => null)
    if (next) setPage(next)
  }

  const book = async (iso: string) => {
    setBusy(true)
    try {
      await confirmBooking({ token, start: iso, note: note || undefined })
      toast.success(t('bookedToast'))
      await refresh()
      setDay(null)
      setStart(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('bookFailed'))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setBusy(true)
    try {
      await cancelBooking(token)
      toast.success(t('cancelledToast'))
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('cancelFailed'))
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <div className="flex items-center gap-3">
      {page.workshop.logoUrl ? (
        <img src={page.workshop.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" />
      ) : null}
      <div>
        <p className="font-semibold">{page.workshop.name}</p>
        <p className="text-sm text-muted-foreground">{t('title')}</p>
      </div>
    </div>
  )

  const vehicle = (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="font-medium">
        {page.vehicle.label}
        {page.vehicle.licensePlate && (
          <span className="ml-2 font-mono text-muted-foreground">{page.vehicle.licensePlate}</span>
        )}
      </p>
      <p className="text-muted-foreground">
        {t('due', { date: format.dateTime(new Date(page.dueAt), { dateStyle: 'long' }) })}
      </p>
    </div>
  )

  const phone = page.workshop.phone ? (
    <a
      href={`tel:${page.workshop.phone.replace(/\s+/g, '')}`}
      className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
    >
      <Phone className="h-4 w-4" />
      {t('callUs', { phone: page.workshop.phone })}
    </a>
  ) : null

  let body: React.ReactNode
  if (page.state === 'booked' && page.booking) {
    body = (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CalendarCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
          <div>
            <p className="font-medium">
              {page.booking.pendingApproval
                ? t('pending', { when: when(page.booking.start) })
                : t('booked', { when: when(page.booking.start) })}
            </p>
            <p className="text-sm text-muted-foreground">
              {page.booking.pendingApproval ? t('pendingHint') : t('bookedHint')}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={cancel} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CalendarX className="mr-2 h-4 w-4" />
          )}
          {t('changeOrCancel')}
        </Button>
        {phone}
      </div>
    )
  } else if (page.state === 'expired') {
    body = (
      <div className="space-y-3">
        <p className="font-medium">{t('expired')}</p>
        <p className="text-sm text-muted-foreground">{t('expiredHint')}</p>
        {phone}
      </div>
    )
  } else if (page.state === 'unavailable' || page.firstStart === null) {
    body = (
      <div className="space-y-3">
        <p className="font-medium">{t('unavailable')}</p>
        <p className="text-sm text-muted-foreground">{t('unavailableHint')}</p>
        {phone}
      </div>
    )
  } else {
    body = (
      <div className="space-y-5">
        {!day && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('firstSlot')}</p>
            <Button
              size="lg"
              className="w-full justify-start text-left"
              onClick={() => book(page.firstStart as string)}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarCheck className="mr-2 h-4 w-4" />
              )}
              {t('bookThis', { when: when(page.firstStart) })}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">{day ? t('pickTime') : t('pickAnother')}</p>
          <div className="flex flex-wrap gap-1.5">
            {openDays.map((d) => (
              <button
                key={d.date}
                type="button"
                disabled={d.status === 'full'}
                onClick={() => {
                  setDay(d.date)
                  setStart(null)
                }}
                className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  day === d.date
                    ? 'border-primary bg-primary text-primary-foreground'
                    : d.status === 'full'
                      ? 'cursor-not-allowed border-border text-muted-foreground/50 line-through'
                      : d.status === 'limited'
                        ? 'border-amber-500/40 hover:bg-amber-500/10'
                        : 'hover:bg-muted'
                }`}
                title={t(`day.${d.status}`)}
              >
                {dayLabel(d.date)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('legend')}</p>
        </div>

        {chosenDay && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {chosenDay.starts.map((iso) => (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setStart(iso)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    start === iso
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  {time(iso)}
                </button>
              ))}
            </div>
            <Textarea
              rows={2}
              placeholder={t('notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
            <Button
              className="w-full"
              disabled={!start || busy}
              onClick={() => start && book(start)}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarCheck className="mr-2 h-4 w-4" />
              )}
              {start ? t('confirmFor', { when: when(start) }) : t('pickTimeFirst')}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {page.bookingMode === 'request'
            ? t('modeRequestNote')
            : t('modeDirectNote', { minutes: page.durationMinutes })}
        </p>
        {phone}
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-4 py-8">
      {header}
      {vehicle}
      {body}
      <p className="mt-auto pt-6 text-center text-[11px] text-muted-foreground">{t('footer')}</p>
    </div>
  )
}
