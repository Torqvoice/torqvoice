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
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { JobMeters } from '@/features/meters/Components/JobMeters'
import { meterAskLimit } from '@/features/meters/Lib/meterAsk'
import { MUCH_HIGHER_READING } from '@/features/vehicles/Lib/vehicleReading'

const METER = {
  vehicleMeterId: 'vm-1',
  meterTypeId: 't-1',
  name: 'Engine hours',
  unit: 'hrs',
  value: null,
  last: 4256.7,
  required: false,
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

  it('for a meter in kilometres uses the odometer’s limit, not the hours one', async () => {
    const km = { ...METER, name: 'Trailer km', unit: 'km', last: 120_000 }
    render(<JobMeters jobId="job-1" meters={[km]} />)
    // 30,000 km since the last visit: a year of driving, not a slipped digit.
    const box = screen.getByLabelText('Trailer km')
    await act(async () => {
      fireEvent.change(box, { target: { value: '150000' } })
      fireEvent.blur(box)
    })
    expect(screen.queryByTestId('reading-question')).not.toBeInTheDocument()
    expect(setJobMeterReading).toHaveBeenCalledTimes(1)
  })

  it('is never asked for a meter whose unit fits no limit', async () => {
    const lifts = { ...METER, name: 'Lifts', unit: 'cycles', last: 10 }
    render(<JobMeters jobId="job-1" meters={[lifts]} />)
    const box = screen.getByLabelText('Lifts')
    await act(async () => {
      fireEvent.change(box, { target: { value: '9999999' } })
      fireEvent.blur(box)
    })
    expect(screen.queryByTestId('reading-question')).not.toBeInTheDocument()
    expect(setJobMeterReading).toHaveBeenCalledTimes(1)
  })
})

describe('a reading typed on this job somewhere else', () => {
  it('shows in the box when the page refreshes, unless the box holds an unsaved reading', async () => {
    const { rerender } = render(<JobMeters jobId="job-1" meters={[METER]} />)
    // Another tab saved 4,301.5 and this page refreshed.
    rerender(<JobMeters jobId="job-1" meters={[{ ...METER, value: 4301.5 }]} />)
    expect(screen.getByLabelText('Engine hours')).toHaveValue('4301.5')

    // Something typed here and not yet saved is kept over the next refresh.
    fireEvent.change(screen.getByLabelText('Engine hours'), { target: { value: '4310' } })
    rerender(<JobMeters jobId="job-1" meters={[{ ...METER, value: 4305 }]} />)
    expect(screen.getByLabelText('Engine hours')).toHaveValue('4310')
    expect(setJobMeterReading).not.toHaveBeenCalled()
  })
})

describe('the limit a meter’s unit asks with', () => {
  it('is the distance limit for distances, the hours limit for hours, and none otherwise', () => {
    for (const unit of ['km', ' KM ', 'Kilometres', 'mi', 'miles', 'nm', 'NMI', 'км']) {
      expect(meterAskLimit(unit), unit).toBe(MUCH_HIGHER_READING.distance)
    }
    // English, and every language's own short form for engine hours.
    for (const unit of [
      'h',
      'hr',
      'HRS',
      'hours',
      'Std.',
      't',
      'timer',
      'u',
      'sa',
      'val.',
      'godz.',
      'ч',
    ]) {
      expect(meterAskLimit(unit), unit).toBe(MUCH_HIGHER_READING.hours)
    }
    for (const unit of ['', 'l', 'litres', 'cycles', 'kWh', 'bar', null, undefined]) {
      expect(meterAskLimit(unit), String(unit)).toBeNull()
    }
  })

  it('knows every hours unit the app ships in its languages', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const dir = `${process.cwd()}/messages`
    for (const locale of readdirSync(dir)) {
      const settings = JSON.parse(readFileSync(`${dir}/${locale}/settings.json`, 'utf8'))
      const unit = settings.meters?.hoursUnit
      if (unit) expect(meterAskLimit(unit), `${locale}: ${unit}`).toBe(MUCH_HIGHER_READING.hours)
    }
  })
})

describe('the question on the vehicle page’s own reading dialog', () => {
  it('says nothing about a work order, which is not there', async () => {
    const { ReadingQuestion } = await import('@/features/vehicles/Components/ReadingQuestion')
    const { unmount } = render(
      <ReadingQuestion
        entered={42567}
        last={4256.7}
        meterUnit="hrs"
        onWorkOrder={false}
        onConfirm={vi.fn()}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText(/much higher than the last reading/)).toBeInTheDocument()
    expect(screen.queryByText(/work order/)).toBeNull()
    unmount()

    render(
      <ReadingQuestion
        entered={42567}
        last={4256.7}
        meterUnit="hrs"
        onConfirm={vi.fn()}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText(/The rest of the work order saves as usual/)).toBeInTheDocument()
  })
})
