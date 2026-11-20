/**
 * A meter reading far above the last one asks "Are you sure this reading is
 * correct?" before it is saved, as the odometer does; an ordinary one saves
 * straight away.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const setJobMeterReading = vi.hoisted(() => vi.fn())
vi.mock('@/features/meters/Actions/jobMeterActions', () => ({ setJobMeterReading }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { JobMeters } from '@/features/meters/Components/JobMeters'

const METER = {
  vehicleMeterId: 'vm-1',
  meterTypeId: 't-1',
  name: 'Engine hours',
  unit: 'hrs',
  value: null,
  last: 4256.7,
}

function typeAndLeave(value: string) {
  const box = screen.getByLabelText('Engine hours')
  fireEvent.change(box, { target: { value } })
  fireEvent.blur(box)
}

beforeEach(() => {
  setJobMeterReading.mockReset().mockResolvedValue({
    success: true,
    data: { vehicleMeterId: 'vm-1', value: 1, last: 4256.7, lower: false },
  })
})

describe('a reading far above the last one', () => {
  it('waits for a yes, then saves', async () => {
    render(<JobMeters jobId="job-1" meters={[METER]} />)
    await act(async () => typeAndLeave('42567'))

    expect(screen.getByTestId('reading-question')).toHaveTextContent('42,567 hrs')
    expect(screen.getByTestId('reading-question')).toHaveTextContent('4,256.7 hrs')
    expect(setJobMeterReading).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, it is correct' }))
    })
    expect(setJobMeterReading).toHaveBeenCalledWith({
      jobId: 'job-1',
      vehicleMeterId: 'vm-1',
      value: '42567',
    })
  })

  it('is not asked about for an ordinary reading', async () => {
    render(<JobMeters jobId="job-1" meters={[METER]} />)
    await act(async () => typeAndLeave('4290,5'))
    expect(screen.queryByTestId('reading-question')).not.toBeInTheDocument()
    expect(setJobMeterReading).toHaveBeenCalledTimes(1)
  })
})
