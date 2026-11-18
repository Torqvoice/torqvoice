import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMyClock = vi.fn()
const startMyClock = vi.fn()
vi.mock('@/features/time-tracking/Actions/timeClockActions', () => ({
  getMyClock: () => getMyClock(),
  startMyClock: (input: unknown) => startMyClock(input),
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

/** A start button that says what start() told it. */
function StartButton() {
  const { start } = useTimeClock()
  const [outcome, setOutcome] = useState('')
  return (
    <>
      <button
        type="button"
        onClick={() =>
          start('sr-2').then(
            (ok) => setOutcome(ok ? 'Start worked' : 'Start refused'),
            () => setOutcome('Start not confirmed')
          )
        }
      >
        Start
      </button>
      <p>{outcome}</p>
    </>
  )
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
    startMyClock.mockReset()
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

  it('does not say a start worked when the clock cannot be read back', async () => {
    getMyClock.mockResolvedValueOnce(running)
    render(
      <TimeClockProvider technicianIds={['tech-1']}>
        <ClockLine />
        <StartButton />
      </TimeClockProvider>
    )
    await screen.findByText('Clocked in on Front brake pads')

    // The start reaches the server, the read after it does not
    startMyClock.mockResolvedValueOnce({
      success: true,
      data: { startedAt: '2026-11-07T09:00:00.000Z', closed: null },
    })
    getMyClock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(await screen.findByText('Start not confirmed')).toBeInTheDocument()
    expect(screen.queryByText('Start worked')).not.toBeInTheDocument()
  })
})
