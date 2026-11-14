/**
 * The vehicle page lists every unfinished job above the finished ones, and a
 * job whose booking will not work says what is wrong on its own row, in the
 * work order's words. The row itself is the way into the job to fix it.
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

function renderFeed(
  jobWarnings: VehicleJobWarning[],
  workOrders = [inWorkshop, later, done],
  owed: Record<string, 'unpaid' | 'partial'> = {}
) {
  return render(
    <TooltipProvider>
      <VehicleActivityFeed
        vehicleId="veh-1"
        filter="all"
        search=""
        workOrders={workOrders}
        quotes={[]}
        inspections={[]}
        distUnit="km"
        readingLabel="Mileage"
        currencyCode="NOK"
        vehicleMileage={0}
        jobWarnings={jobWarnings}
        owed={owed}
      />
    </TooltipProvider>
  )
}

/** The table row a job is on, found by the job's title. */
const rowOf = (title: string) =>
  screen.getByRole('link', { name: title }).closest('li') as HTMLElement

describe('the jobs table on the vehicle page', () => {
  it('says what is wrong on the row of the job in the workshop', () => {
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

    const row = rowOf('Brake service')
    expect(
      within(row).getByText('Ola Nordmann: Away (On leave) · Nov 16 – Nov 17')
    ).toBeInTheDocument()
    expect(within(row).getByText(/This booking needs attention/)).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Brake service' })).toHaveAttribute(
      'href',
      '/vehicles/veh-1/service/wo-now'
    )
    expect(within(rowOf('Tyre change')).queryByTestId('job-warning')).not.toBeInTheDocument()
  })

  it('says every problem on a job that is not in the workshop yet', () => {
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

    const said = within(rowOf('Tyre change')).getByTestId('job-warning')
    expect(said).toHaveTextContent('Volvo XC60 AB12345')
    expect(said).toHaveTextContent('The workshop is closed then: Staff day')
    expect(within(rowOf('Brake service')).queryByTestId('job-warning')).not.toBeInTheDocument()
  })

  it('lists every unfinished job as open, and finished work under its year', () => {
    renderFeed([])

    const open = screen.getByRole('region', { name: 'Open jobs' })
    expect(within(open).getByRole('link', { name: 'Brake service' })).toBeInTheDocument()
    expect(within(open).getByRole('link', { name: 'Tyre change' })).toBeInTheDocument()
    expect(within(open).queryByRole('link', { name: 'Oil change' })).not.toBeInTheDocument()

    const year = screen.getByRole('region', { name: '2026' })
    expect(within(year).getByRole('link', { name: 'Oil change' })).toBeInTheDocument()
  })

  it('says what was done on a job, and that it has not been paid', () => {
    renderFeed(
      [],
      [
        workOrder({
          id: 'wo-done',
          title: 'Service',
          serviceDate: day(2),
          totalAmount: 1200,
          laborItems: [{ description: 'Oil and filter' }],
          partItems: [{ name: '5W-30 6 l' }],
        }),
      ],
      { 'wo-done': 'unpaid' }
    )

    const row = rowOf('Service')
    expect(within(row).getByText(/Oil and filter · 5W-30 6 l/)).toBeInTheDocument()
    expect(within(row).getByText('Unpaid')).toBeInTheDocument()
  })

  it('still says a job is unpaid when its booking has a problem too', () => {
    const billed = workOrder({
      id: 'wo-billed',
      title: 'Clutch',
      status: 'in-progress',
      startDateTime: day(16),
      totalAmount: 900,
      laborItems: [{ description: 'Clutch kit' }],
    })
    renderFeed([warning({ serviceRecordId: 'wo-billed', closures: ['Staff day'] })], [billed], {
      'wo-billed': 'unpaid',
    })

    const row = rowOf('Clutch')
    expect(within(row).getByText('Unpaid')).toBeInTheDocument()
    // The warning opens the job itself, so it can be hovered and clicked.
    const said = within(row).getByTestId('job-warning')
    expect(said).toHaveTextContent('The workshop is closed then: Staff day')
    expect(said).toHaveAttribute('href', '/vehicles/veh-1/service/wo-billed')
    expect(said).toHaveAttribute('title', expect.stringContaining('Staff day'))
  })

  it('says in words which rows are a quote or an inspection', () => {
    render(
      <TooltipProvider>
        <VehicleActivityFeed
          vehicleId="veh-1"
          filter="all"
          search=""
          workOrders={[done]}
          quotes={[
            {
              id: 'q1',
              quoteNumber: 'QT-1002',
              title: 'Rear brakes',
              status: 'converted',
              totalAmount: 2237,
              createdAt: day(3),
            },
          ]}
          inspections={[
            {
              id: 'i1',
              status: 'in_progress',
              createdAt: day(4),
              completedAt: null,
              template: { name: 'Vehicle check-in' },
              items: [],
            },
          ]}
          distUnit="km"
          readingLabel="Mileage"
          currencyCode="NOK"
          vehicleMileage={0}
        />
      </TooltipProvider>
    )

    expect(within(rowOf('Rear brakes')).getByText('Quote')).toBeInTheDocument()
    expect(within(rowOf('Vehicle check-in')).getByText('Inspection')).toBeInTheDocument()
    // A work order is the table's default and carries no label.
    expect(within(rowOf('Oil change')).queryByText('Quote')).not.toBeInTheDocument()
  })

  it('flags nothing when no job has a problem', () => {
    renderFeed([])
    expect(screen.queryByTestId('job-warning')).not.toBeInTheDocument()
    expect(screen.getByText('Brake service')).toBeInTheDocument()
  })
})
