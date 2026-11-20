/**
 * A required meter on the work order: its box carries the required mark, in
 * words a screen reader says too, and when finishing the job was refused for
 * it, the box is marked, says why, and takes the focus so the reading is
 * typed right there. A meter that is not required looks as it always has.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const setJobMeterReading = vi.hoisted(() => vi.fn())
const refresh = vi.hoisted(() => vi.fn())
vi.mock('@/features/meters/Actions/jobMeterActions', () => ({ setJobMeterReading }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { JobMeters } from '@/features/meters/Components/JobMeters'
import { revealRequiredMeters } from '@/features/meters/Lib/requiredMetersReveal'

const meter = (over: Partial<Parameters<typeof JobMeters>[0]['meters'][number]>) => ({
  vehicleMeterId: 'vm-pto',
  meterTypeId: 't-pto',
  name: 'PTO hours',
  unit: 'hrs',
  value: null,
  last: null,
  required: false,
  ...over,
})

const PTO = meter({ required: true })
const ENGINE = meter({ vehicleMeterId: 'vm-engine', meterTypeId: 't-engine', name: 'Engine hours' })

beforeEach(() => {
  refresh.mockReset()
  setJobMeterReading.mockReset().mockResolvedValue({
    success: true,
    data: { vehicleMeterId: 'vm-pto', value: 812.5, last: null, lower: false },
  })
  Element.prototype.scrollIntoView = vi.fn()
})

describe('the required mark', () => {
  it('is on a required meter, named for a screen reader, and on no other', () => {
    render(<JobMeters jobId="job-1" meters={[PTO, ENGINE]} />)
    const pto = screen.getByRole('textbox', { name: 'PTO hours (required)' })
    expect(pto).toHaveAttribute('aria-required', 'true')
    const engine = screen.getByRole('textbox', { name: 'Engine hours' })
    expect(engine).not.toHaveAttribute('aria-required')
    expect(screen.getAllByText('*')).toHaveLength(1)
  })
})

describe('a refusal that named the meter', () => {
  it('marks its empty box, says why under it and puts the focus there', async () => {
    render(<JobMeters jobId="job-1" meters={[ENGINE, PTO]} />)
    const pto = screen.getByRole('textbox', { name: /PTO hours/ })
    expect(pto).not.toHaveAttribute('aria-invalid')

    await act(async () => revealRequiredMeters('job-1', [{ vehicleMeterId: 'vm-pto' }]))

    expect(pto).toHaveAttribute('aria-invalid', 'true')
    expect(pto).toHaveAccessibleDescription('Required before the job is completed.')
    expect(pto).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Engine hours' })).not.toHaveAttribute(
      'aria-invalid'
    )
  })

  it('lets go of the box once a reading is typed', async () => {
    render(<JobMeters jobId="job-1" meters={[PTO]} />)
    await act(async () => revealRequiredMeters('job-1', [{ vehicleMeterId: 'vm-pto' }]))
    const pto = screen.getByRole('textbox', { name: /PTO hours/ })
    await act(async () => {
      fireEvent.change(pto, { target: { value: '812,5' } })
      fireEvent.blur(pto)
    })
    expect(pto).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByTestId('job-meter-required')).not.toBeInTheDocument()
    expect(setJobMeterReading).toHaveBeenCalledWith({
      jobId: 'job-1',
      vehicleMeterId: 'vm-pto',
      value: '812,5',
    })
  })

  it('is about this job only', async () => {
    render(<JobMeters jobId="job-1" meters={[PTO]} />)
    await act(async () => revealRequiredMeters('job-2', [{ vehicleMeterId: 'vm-pto' }]))
    expect(screen.getByRole('textbox', { name: /PTO hours/ })).not.toHaveAttribute('aria-invalid')
  })

  it('reads the job again for a meter the page does not show yet', async () => {
    render(<JobMeters jobId="job-1" meters={[PTO]} />)
    await act(async () => revealRequiredMeters('job-1', [{ vehicleMeterId: 'vm-crane' }]))
    expect(refresh).toHaveBeenCalled()
  })
})
