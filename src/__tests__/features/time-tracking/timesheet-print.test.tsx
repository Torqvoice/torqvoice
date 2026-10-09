import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en/timeTracking.json'
import {
  type PrintGroup,
  TimesheetPrintSheet,
} from '@/features/time-tracking/Components/TimesheetPrintSheet'
import { printTimesheet } from '@/features/time-tracking/Lib/print-timesheet'
import type { SheetEntry } from '@/features/time-tracking/Lib/timesheet'

const entry: SheetEntry = {
  id: 'e1',
  technicianId: 't1',
  technicianName: 'Kari',
  technicianColor: '#000',
  startedAt: '2026-09-06T22:00:00Z',
  endedAt: '2026-09-07T02:00:00Z',
  durationMinutes: 240,
  source: 'app',
  note: '<script>alert("note")</script>',
  editedAt: null,
  editedByName: null,
  job: {
    id: 'j1',
    title: 'Brakes',
    status: 'in-progress',
    vehicleId: 'v1',
    vehicleLabel: 'Volvo V70',
    licensePlate: 'AB12345',
    clientName: 'Alice & Bob',
  },
}

afterEach(() => {
  cleanup()
  document.querySelectorAll('iframe').forEach((frame) => frame.remove())
  vi.useRealTimers()
})

function renderSheet(groups: PrintGroup[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ timeTracking: messages }}>
      <TimesheetPrintSheet
        title="Timesheets"
        range="2026-09-07"
        technician="All technicians"
        zoneNote="Times are in UTC"
        groups={groups}
        now={new Date('2026-09-07T03:00:00Z')}
        formatDate={(date) => date.slice(0, 10)}
        formatTime={(date) => date.slice(11, 16)}
      />
    </NextIntlClientProvider>
  )
}

describe('printable timesheet', () => {
  it('lists client, vehicle, plate, source and note with the whole entry as its duration', () => {
    const { container } = renderSheet([
      { key: 'alice', label: 'Alice & Bob', entries: [entry], minutes: 240 },
    ])
    expect(screen.getByRole('columnheader', { name: 'Client' })).toBeInTheDocument()
    const row = screen.getAllByRole('row')[2]
    expect(within(row).getByText('Alice & Bob')).toBeInTheDocument()
    expect(within(row).getByText('Volvo V70 · AB12345')).toBeInTheDocument()
    expect(within(row).getByText('App')).toBeInTheDocument()
    // 22:00 to 02:00 is four hours on the row that says so, not two.
    expect(within(row).getByText('22:00 – 2026-09-07 02:00')).toBeInTheDocument()
    expect(within(row).getByText('4h 00m')).toBeInTheDocument()
    expect(within(row).getByText(entry.note as string)).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('a, button')).toBeNull()
  })

  it('heads each group with its subtotal and totals the rows', () => {
    const running: SheetEntry = {
      ...entry,
      id: 'e2',
      technicianName: 'Ola',
      endedAt: null,
      durationMinutes: null,
      source: 'web',
      editedByName: 'Manager',
      job: { ...entry.job, vehicleId: null, vehicleLabel: null, licensePlate: null },
    }
    renderSheet([
      { key: 'a', label: 'Alice & Bob', entries: [entry], minutes: 240 },
      { key: 'b', label: 'No client', entries: [running], minutes: 300 },
    ])
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(6)
    expect(within(rows[1]).getByText('Alice & Bob')).toBeInTheDocument()
    expect(within(rows[1]).getByText('4h 00m')).toBeInTheDocument()
    expect(within(rows[3]).getByText('No client')).toBeInTheDocument()
    expect(within(rows[3]).getByText('5h 00m')).toBeInTheDocument()
    expect(within(rows[4]).getByText('Ola')).toBeInTheDocument()
    expect(within(rows[4]).getByText('Counter sale')).toBeInTheDocument()
    expect(within(rows[4]).getByText('22:00 – Running')).toBeInTheDocument()
    expect(within(rows[4]).getByText('Web (Adjusted by Manager)')).toBeInTheDocument()
    expect(within(rows[5]).getByText('Total time')).toBeInTheDocument()
    expect(within(rows[5]).getByText('9h 00m')).toBeInTheDocument()
    expect(screen.getByText('Signature')).toBeInTheDocument()
  })
})

describe('printTimesheet', () => {
  it('prints an isolated snapshot and removes the iframe after printing', () => {
    vi.useFakeTimers()
    const content = document.createElement('div')
    content.textContent = 'Alice & Bob'
    printTimesheet(content, 'Timesheets')
    content.textContent = 'Changed after clicking print'
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    const view = frame.contentWindow as Window
    const print = vi.spyOn(view, 'print').mockImplementation(() => undefined)
    vi.spyOn(view, 'focus').mockImplementation(() => undefined)
    frame.dispatchEvent(new Event('load'))
    expect(print).toHaveBeenCalledOnce()
    expect(frame.contentDocument?.title).toBe('Timesheets')
    expect(frame.contentDocument?.body.textContent).toBe('Alice & Bob')
    expect(frame.contentDocument?.querySelector('style')?.textContent).toContain(
      'table-header-group'
    )
    view.dispatchEvent(new Event('afterprint'))
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('cleans up when a browser does not emit afterprint', () => {
    vi.useFakeTimers()
    printTimesheet(document.createElement('div'), 'Timesheets')
    expect(document.querySelector('iframe')).not.toBeNull()
    vi.advanceTimersByTime(300_000)
    expect(document.querySelector('iframe')).toBeNull()
  })
})
