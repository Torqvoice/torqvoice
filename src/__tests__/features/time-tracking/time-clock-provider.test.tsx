import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMyClock = vi.fn()
vi.mock('@/features/time-tracking/Actions/timeClockActions', () => ({
  getMyClock: () => getMyClock(),
  startMyClock: vi.fn(),
  stopMyClock: vi.fn(),
}))

/** The app's one socket, reduced to what the clock listens to. */
const resyncHandlers = new Set<() => void>()
const realtime = {
  onLegacy: () => () => undefined,
  onResync: (handler: () => void) => {
    resyncHandlers.add(handler)
    return () => resyncHandlers.delete(handler)
  },
}
vi.mock('@/features/realtime/RealtimeProvider', () => ({
  useRealtime: () => realtime,
}))

import {
  TimeClockProvider,
  useTimeClock,
} from '@/features/time-tracking/Components/TimeClockProvider'

function ClockLine() {
  const { open } = useTimeClock()
  return <p>{open ? `Clocked in on ${open.jobTitle}` : 'Not clocked in'}</p>
}

const running = {
  success: true,
  data: {
    technicianIds: ['tech-1'],
    open: {
      id: 'clock-1',
      startedAt: '2026-11-07T07:30:00.000Z',
      serviceRecordId: 'sr-1',
      jobTitle: 'Front brake pads',
      vehicleId: null,
    },
  },
}

describe('TimeClockProvider', () => {
  beforeEach(() => {
    getMyClock.mockReset()
    resyncHandlers.clear()
  })

  it('keeps showing the running clock when a reconnection cannot read it', async () => {
    getMyClock.mockResolvedValueOnce(running)
    render(
      <TimeClockProvider technicianIds={['tech-1']}>
        <ClockLine />
      </TimeClockProvider>
    )
    expect(await screen.findByText('Clocked in on Front brake pads')).toBeInTheDocument()

    // A laptop waking up on another network: the socket is back, the request is not
    getMyClock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(async () => {
      for (const handler of resyncHandlers) handler()
      await Promise.resolve()
    })

    expect(getMyClock).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Clocked in on Front brake pads')).toBeInTheDocument()
  })

  it('reads the clock again on a reconnection that works', async () => {
    getMyClock.mockResolvedValueOnce(running)
    render(
      <TimeClockProvider technicianIds={['tech-1']}>
        <ClockLine />
      </TimeClockProvider>
    )
    await screen.findByText('Clocked in on Front brake pads')

    // Stopped from the phone while the laptop slept
    getMyClock.mockResolvedValueOnce({
      success: true,
      data: { technicianIds: ['tech-1'], open: null },
    })
    await act(async () => {
      for (const handler of resyncHandlers) handler()
      await Promise.resolve()
    })

    expect(await screen.findByText('Not clocked in')).toBeInTheDocument()
  })
})
