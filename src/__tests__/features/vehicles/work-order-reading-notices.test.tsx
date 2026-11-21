/**
 * The reading on the work order. Typing one below the last known reading says
 * so quietly beside the field; one so far above it that a digit may have
 * slipped in is asked about under the field, and the save holds it back until
 * it is answered (work-order-reading-question.test.tsx). Nothing at all when
 * readings go up by a normal amount.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/features/quotes/Components/VehicleCombobox', () => ({ VehicleCombobox: () => null }))
// The meter rows read the job again when a refusal names a meter they do not show.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ServiceTypeProvider } from '@/components/service-type-context'
import { JobFactsCard } from '@/features/vehicles/Components/service-page/modern/JobFactsCard'

type Props = React.ComponentProps<typeof JobFactsCard>

const VEHICLE = {
  id: 'veh-1',
  make: 'Scania',
  model: 'R 450',
  year: 2019,
  vin: null,
  licensePlate: 'ZZ19 TST',
  mileage: 412380,
  customer: null,
}

function renderCard(
  over: {
    mileage?: number | null
    lastReading?: number | null
    marine?: boolean
    meters?: Props['initialData']['meters']
  } = {}
) {
  const initialData = {
    id: 'job-1',
    mileage: over.mileage === undefined ? null : over.mileage,
    lastReading: over.lastReading === undefined ? 412380 : over.lastReading,
    meters: over.meters,
  } as Props['initialData']
  const card = (
    <JobFactsCard
      record={{ id: 'job-1', vehicle: VEHICLE, customer: null } as unknown as Props['record']}
      currencyCode="GBP"
      initialData={initialData}
      vehicleName="2019 Scania R 450"
      selectedVehicleId="veh-1"
      setSelectedVehicleId={vi.fn()}
      techName=""
      distanceUnit="km"
    />
  )
  return render(
    over.marine ? <ServiceTypeProvider serviceType="marine">{card}</ServiceTypeProvider> : card
  )
}

const NOTICE = 'Lower than the last reading (412,380 km). You can still save it.'

describe('the reading on a work order', () => {
  it('says nothing on a page as it loads, even with a saved reading below the last one', () => {
    renderCard({ mileage: 400000 })
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
  })

  it('says nothing when the reading typed is higher or the same', () => {
    renderCard()
    const field = screen.getByLabelText('Mileage')
    fireEvent.change(field, { target: { value: '415000' } })
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
    fireEvent.change(field, { target: { value: '412380' } })
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
    expect(field).not.toHaveAttribute('aria-describedby')
  })

  it('says a lower reading is lower, beside the field, and leaves it as typed', () => {
    renderCard()
    const field = screen.getByLabelText('Mileage')
    fireEvent.change(field, { target: { value: '41238' } })
    expect(screen.getByRole('status')).toHaveTextContent(NOTICE)
    expect(field).toHaveAccessibleDescription(NOTICE.replace(' km', '\u00a0km'))
    // Nothing is refused: the field holds what was typed and is not marked invalid.
    expect(field).toHaveValue(41238)
    expect(field).toBeValid()
    expect(field).toBeEnabled()
  })

  it('is still there after the page has saved the reading by itself', () => {
    const view = renderCard()
    fireEvent.change(screen.getByLabelText('Mileage'), { target: { value: '41238' } })
    // The autosave lands and the page hands the card the saved job.
    view.rerender(
      <JobFactsCard
        record={{ id: 'job-1', vehicle: VEHICLE, customer: null } as unknown as Props['record']}
        currencyCode="GBP"
        initialData={{ id: 'job-1', mileage: 41238, lastReading: 412380 } as Props['initialData']}
        vehicleName="2019 Scania R 450"
        selectedVehicleId="veh-1"
        setSelectedVehicleId={vi.fn()}
        techName=""
        distanceUnit="km"
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent(NOTICE)
  })

  it('goes quiet again when the field is emptied or corrected upwards', () => {
    renderCard()
    const field = screen.getByLabelText('Mileage')
    fireEvent.change(field, { target: { value: '100' } })
    expect(screen.getByTestId('lower-reading-notice')).toBeInTheDocument()
    fireEvent.change(field, { target: { value: '' } })
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
    fireEvent.change(field, { target: { value: '100' } })
    fireEvent.change(field, { target: { value: '413000' } })
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
  })

  it('says nothing when no reading is known for the vehicle', () => {
    renderCard({ lastReading: null })
    fireEvent.change(screen.getByLabelText('Mileage'), { target: { value: '5' } })
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
  })

  it('speaks of engine hours in a boat workshop', () => {
    renderCard({ lastReading: 1240, marine: true })
    fireEvent.change(screen.getByLabelText('Engine Hours'), { target: { value: '900' } })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Lower than the last reading (1,240 hours). You can still save it.'
    )
  })
})

describe('a reading far above the last one on a work order', () => {
  const ASK = 'Are you sure this reading is correct?'
  const BODY = '4,123,800 km is much higher than the last reading, 412,380 km.'

  function renderAsking(over: { confirmedReading?: number | null; marine?: boolean } = {}) {
    const onConfirmReading = vi.fn()
    const card = (
      <JobFactsCard
        record={{ id: 'job-1', vehicle: VEHICLE, customer: null } as unknown as Props['record']}
        currencyCode="GBP"
        initialData={
          {
            id: 'job-1',
            mileage: null,
            lastReading: over.marine ? 1240 : 412380,
          } as Props['initialData']
        }
        vehicleName="2019 Scania R 450"
        selectedVehicleId="veh-1"
        setSelectedVehicleId={vi.fn()}
        techName=""
        distanceUnit="km"
        confirmedReading={over.confirmedReading ?? null}
        onConfirmReading={onConfirmReading}
      />
    )
    const view = render(
      over.marine ? <ServiceTypeProvider serviceType="marine">{card}</ServiceTypeProvider> : card
    )
    return { onConfirmReading, view }
  }

  it('asks under the field, with both readings, and only that', () => {
    renderAsking()
    const field = screen.getByLabelText('Mileage')
    fireEvent.change(field, { target: { value: '4123800' } })
    const question = screen.getByTestId('reading-question')
    expect(question).toHaveTextContent(ASK)
    expect(question).toHaveTextContent(BODY)
    expect(screen.queryByTestId('higher-reading-notice')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lower-reading-notice')).not.toBeInTheDocument()
    // Nothing pops up over the field: it keeps what was typed.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(field).toHaveValue(4123800)
  })

  it('Yes, it is correct says yes to that value', () => {
    const { onConfirmReading } = renderAsking()
    fireEvent.change(screen.getByLabelText('Mileage'), { target: { value: '4123800' } })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, it is correct' }))
    expect(onConfirmReading).toHaveBeenCalledWith(4123800)
  })

  it('Change it goes back to the field, with the value ready to type over', () => {
    const { onConfirmReading } = renderAsking()
    const field = screen.getByLabelText('Mileage') as HTMLInputElement
    fireEvent.change(field, { target: { value: '4123800' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change it' }))
    expect(field).toHaveFocus()
    expect(onConfirmReading).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: '413800' } })
    expect(screen.queryByTestId('reading-question')).not.toBeInTheDocument()
  })

  it('is asked once for a value: not again once confirmed, again for another', () => {
    renderAsking({ confirmedReading: 4123800 })
    const field = screen.getByLabelText('Mileage')
    fireEvent.change(field, { target: { value: '4123800' } })
    expect(screen.queryByTestId('reading-question')).not.toBeInTheDocument()
    fireEvent.change(field, { target: { value: '4123900' } })
    expect(screen.getByTestId('reading-question')).toBeInTheDocument()
  })

  it('is not asked up to 100,000 above, nor without a last reading', () => {
    renderAsking()
    const field = screen.getByLabelText('Mileage')
    fireEvent.change(field, { target: { value: '512380' } })
    expect(screen.queryByTestId('reading-question')).not.toBeInTheDocument()
    fireEvent.change(field, { target: { value: '512381' } })
    expect(screen.getByTestId('reading-question')).toBeInTheDocument()
  })

  it('stays after the page saved the rest by itself', () => {
    const { view } = renderAsking()
    fireEvent.change(screen.getByLabelText('Mileage'), { target: { value: '4123800' } })
    view.rerender(
      <JobFactsCard
        record={{ id: 'job-1', vehicle: VEHICLE, customer: null } as unknown as Props['record']}
        currencyCode="GBP"
        initialData={{ id: 'job-1', mileage: null, lastReading: 412380 } as Props['initialData']}
        vehicleName="2019 Scania R 450"
        selectedVehicleId="veh-1"
        setSelectedVehicleId={vi.fn()}
        techName=""
        distanceUnit="km"
        confirmedReading={null}
        onConfirmReading={vi.fn()}
      />
    )
    expect(screen.getByTestId('reading-question')).toBeInTheDocument()
  })

  it('uses 5,000 engine hours, in hours, in a boat workshop', () => {
    renderAsking({ marine: true })
    const field = screen.getByLabelText('Engine Hours')
    fireEvent.change(field, { target: { value: '6240' } })
    expect(screen.queryByTestId('reading-question')).not.toBeInTheDocument()
    fireEvent.change(field, { target: { value: '12400' } })
    expect(screen.getByTestId('reading-question')).toHaveTextContent(
      '12,400 hours is much higher than the last reading, 1,240 hours.'
    )
  })
})

describe('the rows under the vehicle', () => {
  const METER = {
    vehicleMeterId: 'vm-1',
    meterTypeId: 'mt-1',
    name: 'Engine hours',
    unit: 'hrs',
    value: null,
    last: null,
    askAbove: null,
    item: null,
  } as unknown as NonNullable<Props['initialData']['meters']>[number]

  it('give the mileage label the width the meter labels have, so the fields line up', () => {
    renderCard({ meters: [METER] })
    const mileage = screen.getByText('Mileage', { selector: 'label' })
    const meter = screen.getByText('Engine hours', { selector: 'label, label *' }).closest('label')
    expect(mileage.className).toContain('w-28')
    expect(meter?.className).toContain('w-28')
  })

  it('leave the mileage row as it was on a workshop without meters or equipment', () => {
    renderCard()
    expect(screen.getByText('Mileage', { selector: 'label' }).className).not.toContain('w-28')
  })
})
