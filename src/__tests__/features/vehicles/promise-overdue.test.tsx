/**
 * A promise to the customer, and when it counts as broken.
 *
 * `promisedAt` is what somebody said on the phone: when the vehicle would be
 * ready. It is not the booking, and until now it was visible only on the
 * job's own page, so a missed promise was invisible to anyone not already
 * looking at that job. It is now a sortable column on the work order list and
 * a marker on the board card, which is three places reading one rule. They
 * have to agree, or a job is late on the board and fine in the list.
 */
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { isPromiseOverdue } from '@/features/vehicles/Lib/promise'
import { PromiseOverdueMark } from '@/features/workboard/Components/PromiseOverdueMark'
import messages from '../../../../messages/en/workBoard.json'

const NOW = Date.UTC(2026, 8, 20, 12, 0)
const EARLIER = new Date(NOW - 60 * 60 * 1000).toISOString()
const LATER = new Date(NOW + 60 * 60 * 1000).toISOString()

describe('isPromiseOverdue', () => {
  it('is broken once the promised moment has passed', () => {
    expect(isPromiseOverdue(EARLIER, 'in-progress', NOW)).toBe(true)
    expect(isPromiseOverdue(LATER, 'in-progress', NOW)).toBe(false)
  })

  it('is never broken by a job that is finished', () => {
    // The car was handed over; how long ago it was promised is history.
    expect(isPromiseOverdue(EARLIER, 'completed', NOW)).toBe(false)
  })

  it('is never broken by a job nobody promised', () => {
    expect(isPromiseOverdue(null, 'in-progress', NOW)).toBe(false)
    expect(isPromiseOverdue(undefined, 'pending', NOW)).toBe(false)
  })

  it('takes a Date as readily as a stored string', () => {
    expect(isPromiseOverdue(new Date(NOW - 1), 'pending', NOW)).toBe(true)
    expect(isPromiseOverdue(new Date(NOW + 1), 'pending', NOW)).toBe(false)
  })

  it('treats an unreadable value as no promise rather than as late', () => {
    expect(isPromiseOverdue('not a date', 'pending', NOW)).toBe(false)
  })

  it('is not broken at the exact moment it was promised for', () => {
    expect(isPromiseOverdue(new Date(NOW).toISOString(), 'pending', NOW)).toBe(false)
  })
})

function mark(job: { promisedAt: string | null; status: string }) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PromiseOverdueMark job={job} />
    </NextIntlClientProvider>
  )
}

describe('the marker on a board card', () => {
  it('appears only for a promise already broken', () => {
    mark({ promisedAt: new Date(Date.now() - 60_000).toISOString(), status: 'in-progress' })
    expect(screen.getByTestId('promise-overdue')).toBeTruthy()
  })

  it('stays away from a promise still ahead, which is every ordinary job', () => {
    mark({ promisedAt: new Date(Date.now() + 60 * 60_000).toISOString(), status: 'in-progress' })
    expect(screen.queryByTestId('promise-overdue')).toBeNull()
  })

  it('stays away from a finished job and from one never promised', () => {
    mark({ promisedAt: new Date(Date.now() - 60_000).toISOString(), status: 'completed' })
    expect(screen.queryByTestId('promise-overdue')).toBeNull()
    mark({ promisedAt: null, status: 'in-progress' })
    expect(screen.queryByTestId('promise-overdue')).toBeNull()
  })
})
