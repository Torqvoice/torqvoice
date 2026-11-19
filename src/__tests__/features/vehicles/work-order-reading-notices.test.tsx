/**
 * The reading on the work order: typing one below the last known reading, or
 * one so far above it that a digit may have slipped in, says so beside the
 * field, and never anything when readings go up by a normal amount. It is a
 * notice, not a stop: the field stays as typed, for the save to send.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/features/quotes/Components/VehicleCombobox', () => ({ VehicleCombobox: () => null }))

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
  over: { mileage?: number | null; lastReading?: number | null; marine?: boolean } = {}
) {
  const initialData = {
    id: 'job-1',
    mileage: over.mileage === undefined ? null : over.mileage,
    lastReading: over.lastReading === undefined ? 412380 : over.lastReading,
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
  const HIGHER =
    'Much higher than the last reading (412,380 km). Check for a typo. You can still save it.'

  it('asks about a typo for a digit too many, and only that notice', () => {
    renderCard()
    const field = screen.getByLabelText('Mileage')
    fireEvent.change(field, { target: { value: '4123800' } })
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent(HIGHER)
    expect(field).toHaveAccessibleDescription(HIGHER.replace(' km', '\u00a0km'))
    expect(field).toHaveValue(4123800)
    expect(field).toBeValid()
  })

  it('says nothing up to 100,000 above, whatever the unit', () => {
    renderCard()
    const field = screen.getByLabelText('Mileage')
    fireEvent.change(field, { target: { value: '512380' } })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.change(field, { target: { value: '512381' } })
    expect(screen.getByTestId('higher-reading-notice')).toBeInTheDocument()
  })

  it('is still there after the autosave, and gone when the value is fixed', () => {
    const view = renderCard()
    const field = screen.getByLabelText('Mileage')
    fireEvent.change(field, { target: { value: '4123800' } })
    view.rerender(
      <JobFactsCard
        record={{ id: 'job-1', vehicle: VEHICLE, customer: null } as unknown as Props['record']}
        currencyCode="GBP"
        initialData={{ id: 'job-1', mileage: 4123800, lastReading: 412380 } as Props['initialData']}
        vehicleName="2019 Scania R 450"
        selectedVehicleId="veh-1"
        setSelectedVehicleId={vi.fn()}
        techName=""
        distanceUnit="km"
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent(HIGHER)
    fireEvent.change(field, { target: { value: '413800' } })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says nothing without a last reading', () => {
    renderCard({ lastReading: null })
    fireEvent.change(screen.getByLabelText('Mileage'), { target: { value: '9000000' } })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says nothing when the last reading is 0, as after a new odometer', () => {
    renderCard({ lastReading: 0 })
    fireEvent.change(screen.getByLabelText('Mileage'), { target: { value: '9000000' } })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('uses 5,000 engine hours in a boat workshop', () => {
    renderCard({ lastReading: 1240, marine: true })
    const field = screen.getByLabelText('Engine Hours')
    fireEvent.change(field, { target: { value: '6240' } })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.change(field, { target: { value: '12400' } })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Much higher than the last reading (1,240 hours). Check for a typo. You can still save it.'
    )
  })
})
