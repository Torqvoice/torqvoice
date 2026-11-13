/**
 * A job whose booking will not work is flagged on the vehicle page itself,
 * on the job's own line, with the way into the job to fix it. The car's
 * current job spells the problem out; a job further down says it in a word.
 */

import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  type FeedWorkOrder,
  VehicleActivityFeed,
} from '@/app/(authenticated)/vehicles/[id]/vehicle-activity-feed'
import type { VehicleJobWarning } from '@/features/vehicles/Lib/vehicleJobWarnings'

const day = (d: number, h = 9) => new Date(2026, 10, d, h)

function workOrder(over: Partial<FeedWorkOrder>): FeedWorkOrder {
  return {
    id: 'wo',
    title: 'Job',
    type: 'maintenance',
    status: 'completed',
    cost: 0,
    totalAmount: 0,
    mileage: null,
    serviceDate: day(1),
    startDateTime: null,
    invoiceNumber: null,
    techName: null,
    warrantyMileage: null,
    warrantyExpiresAt: null,
    _count: { attachments: 0 },
    ...over,
  }
}

const inWorkshop = workOrder({
  id: 'wo-now',
  title: 'Brake service',
  status: 'in-progress',
  startDateTime: day(16),
  invoiceNumber: '2026-1071',
  techName: 'Ola Nordmann',
})
const later = workOrder({
  id: 'wo-later',
  title: 'Tyre change',
  status: 'pending',
  startDateTime: day(20),
  invoiceNumber: '2026-1080',
})
const done = workOrder({ id: 'wo-done', title: 'Oil change', serviceDate: day(2) })

const warning = (over: Partial<VehicleJobWarning>): VehicleJobWarning => ({
  serviceRecordId: 'wo',
  title: 'Job',
  invoiceNumber: null,
  start: day(16).toISOString(),
  closures: [],
  closedWeekday: false,
  away: [],
  clashes: [],
  ...over,
})

function renderFeed(jobWarnings: VehicleJobWarning[], workOrders = [inWorkshop, later, done]) {
  return render(
    <TooltipProvider>
      <VehicleActivityFeed
        vehicleId="veh-1"
        filter="all"
        search=""
        workOrders={workOrders}
        quotes={[]}
        inspections={[]}
        notes={[]}
        distUnit="km"
        currencyCode="NOK"
        vehicleMileage={0}
        jobWarnings={jobWarnings}
        onSelectNote={() => undefined}
      />
    </TooltipProvider>
  )
}

describe('booking warnings in the vehicle feed', () => {
  it('spells out the problem on the current job, with a way in to fix it', () => {
    renderFeed([
      warning({
        serviceRecordId: 'wo-now',
        away: [
          {
            people: ['Ola Nordmann'],
            reason: 'holiday',
            // The whole of Monday and Tuesday.
            start: new Date(2026, 10, 16).toISOString(),
            end: new Date(2026, 10, 18).toISOString(),
          },
        ],
      }),
    ])

    const callout = screen.getByTestId('job-warning-callout')
    expect(within(callout).getByText('This booking needs attention')).toBeInTheDocument()
    expect(
      within(callout).getByText('Ola Nordmann: Away (On leave) · Nov 16 – Nov 17')
    ).toBeInTheDocument()
    expect(within(callout).getByRole('link', { name: /Open the job to fix it/ })).toHaveAttribute(
      'href',
      '/vehicles/veh-1/service/wo-now'
    )
  })

  it('spells it out on a job behind the first one in the workshop too', () => {
    // Older, so it is the first job in the card; the warned one comes second.
    const first = workOrder({
      id: 'wo-first',
      title: 'Oil service',
      status: 'in-progress',
      startDateTime: day(1),
    })
    renderFeed(
      [
        warning({
          serviceRecordId: 'wo-now',
          closures: ['Staff day'],
        }),
      ],
      [first, inWorkshop, done]
    )

    const callout = screen.getByTestId('job-warning-callout')
    expect(within(callout).getByText('The workshop is closed then: Staff day')).toBeInTheDocument()
    expect(within(callout).getByRole('link', { name: /Open the job to fix it/ })).toHaveAttribute(
      'href',
      '/vehicles/veh-1/service/wo-now'
    )
  })

  it('says it in a word on a job further down, linking to that job', () => {
    renderFeed([
      warning({
        serviceRecordId: 'wo-later',
        clashes: [
          {
            label: 'Volvo XC60 AB12345',
            start: day(20, 10).toISOString(),
            end: day(20, 12).toISOString(),
            onTechnician: false,
            onBay: true,
            people: [],
          },
        ],
        closures: ['Staff day'],
      }),
    ])

    const chip = screen.getByTestId('job-warning')
    // The first problem, and how many more there are behind it.
    expect(chip).toHaveTextContent('Double-booked+1')
    expect(chip.closest('a')).toHaveAttribute('href', '/vehicles/veh-1/service/wo-later')
    expect(screen.queryByTestId('job-warning-callout')).not.toBeInTheDocument()
  })

  it('flags nothing when no job has a problem', () => {
    renderFeed([])
    expect(screen.queryByTestId('job-warning')).not.toBeInTheDocument()
    expect(screen.queryByTestId('job-warning-callout')).not.toBeInTheDocument()
    expect(screen.getByText('Brake service')).toBeInTheDocument()
  })
})
