import { describe, expect, it, vi, beforeAll } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CalendarEvent } from '@/features/calendar/Actions/calendarActions'

vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'MMM d, yyyy',
    timeFormat: '24h',
    timezone: '',
    weekStartDay: 1,
  }),
}))

vi.mock('@/components/currency-settings-context', () => ({
  useFormatCurrency: () => (amount: number, code: string) => `${amount} ${code}`,
}))

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const confirmMock = vi.fn()
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => confirmMock }))

const deleteScheduledMessage = vi.fn()
vi.mock('@/features/scheduled-messages/Actions/scheduledMessageActions', () => ({
  deleteScheduledMessage: (...args: unknown[]) => deleteScheduledMessage(...args),
}))
const toggleReminder = vi.fn()
const deleteReminder = vi.fn()
vi.mock('@/features/vehicles/Actions/reminderActions', () => ({
  toggleReminder: (...args: unknown[]) => toggleReminder(...args),
  deleteReminder: (...args: unknown[]) => deleteReminder(...args),
}))

// The global next-intl mock has no useFormatter; the calendar's own wrapper
// is what the components import, so give it a plain Intl formatter.
vi.mock('@/features/calendar/Components/useDayFormatter', () => ({
  useDayFormatter: () => ({
    dateTime: (date: Date, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-US', options).format(date),
  }),
}))

import { TimeGridView } from '@/features/calendar/Components/TimeGridView'
import { EventPeekProvider } from '@/features/calendar/Components/EventPeek'

beforeAll(() => {
  // jsdom has neither; Radix popovers and the slot anchor need both.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO
  if (typeof (globalThis as { DOMRect?: unknown }).DOMRect === 'undefined') {
    ;(globalThis as unknown as { DOMRect: unknown }).DOMRect = class {
      x: number
      y: number
      width: number
      height: number
      top: number
      left: number
      right: number
      bottom: number
      constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x
        this.y = y
        this.width = width
        this.height = height
        this.top = y
        this.left = x
        this.right = x + width
        this.bottom = y + height
      }
      toJSON() {
        return this
      }
    }
  }
})

const day = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const days = [
  '2026-08-31',
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-05',
  '2026-09-06',
].map(day)

const job: CalendarEvent = {
  id: 's1',
  title: 'Brake service',
  date: '2026-09-03',
  time: '09:00',
  endTime: '10:00',
  type: 'service',
  status: 'pending',
  vehicleId: 'v1',
  vehicleLabel: '2019 Volvo V90',
  customerName: 'Kari Nordmann',
  invoiceNumber: '2026-1001',
  amount: 1200,
}

const message: CalendarEvent = {
  id: 'm1',
  title: 'Service due soon',
  date: '2026-09-04',
  time: '08:00',
  type: 'message',
  status: 'scheduled',
  channel: 'sms',
  vehicleId: null,
  vehicleLabel: '',
  customerName: 'Ola Nordmann',
  invoiceNumber: null,
  amount: null,
}

function setup() {
  const onRefresh = vi.fn()
  const actions = {
    onNewWorkOrder: vi.fn(),
    onNewReminder: vi.fn(),
    onNewQuote: vi.fn(),
    onScheduleMessage: vi.fn(),
  }
  const onSelectDate = vi.fn()
  const onOpenDay = vi.fn()
  const eventsByDate = new Map<string, CalendarEvent[]>([
    ['2026-09-03', [job]],
    ['2026-09-04', [message]],
  ])
  const utils = render(
    <EventPeekProvider currencyCode="NOK" onRefresh={onRefresh}>
      <TimeGridView
        days={days}
        eventsByDate={eventsByDate}
        todayStr="2026-09-06"
        selectedDateStr="2026-09-06"
        showWeekends
        actions={actions}
        onSelectDate={onSelectDate}
        onOpenDay={onOpenDay}
      />
    </EventPeekProvider>
  )
  // The hour columns are the ones carrying half-hour rules.
  const columns = Array.from(utils.container.querySelectorAll('.relative.border-r')).filter((el) =>
    el.querySelector('.border-dashed')
  ) as HTMLElement[]
  for (const col of columns) {
    // 24 hours drawn 60px tall each, from the top of the viewport.
    col.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 100, height: 1440, right: 100, bottom: 1440 }) as DOMRect
  }
  return { ...utils, actions, onSelectDate, onOpenDay, onRefresh, columns }
}

describe('TimeGridView', () => {
  it('draws seven day columns and the job as a block', () => {
    const { columns } = setup()
    expect(columns).toHaveLength(7)
    expect(screen.getByText('Brake service')).toBeInTheDocument()
  })

  it('opens the create menu at the clicked quarter hour and hands the time on', async () => {
    const { columns, actions, onSelectDate } = setup()
    const tuesday = columns[1]
    fireEvent.click(tuesday, { clientX: 10, clientY: 620 })

    expect(onSelectDate).toHaveBeenCalledTimes(1)
    expect(onSelectDate.mock.calls[0][0].getDate()).toBe(1)

    // 620px of 1440 is 10:20, which rounds to the half hour
    const item = await screen.findByText('New work order at 10:30')
    expect(screen.getByText('Schedule message')).toBeInTheDocument()
    fireEvent.click(item)
    expect(actions.onNewWorkOrder).toHaveBeenCalledWith('2026-09-01', '10:30')
    await waitFor(() => expect(screen.queryByText('Schedule message')).not.toBeInTheDocument())
  })

  it('passes the slot time to a scheduled message too', async () => {
    const { columns, actions } = setup()
    fireEvent.click(columns[2], { clientX: 10, clientY: 900 })
    fireEvent.click(await screen.findByText('Schedule message'))
    expect(actions.onScheduleMessage).toHaveBeenCalledWith('2026-09-02', '15:00')
  })

  it('peeks at a block instead of creating anything', async () => {
    const { actions } = setup()
    fireEvent.click(screen.getByText('Brake service'))
    const link = await screen.findByRole('link', { name: /Open work order/ })
    expect(link).toHaveAttribute('href', '/vehicles/v1/service/s1')
    expect(screen.getByText('Kari Nordmann')).toBeInTheDocument()
    expect(screen.getByText('1200 NOK')).toBeInTheDocument()
    expect(actions.onNewWorkOrder).not.toHaveBeenCalled()
  })

  it('right-click on a scheduled message can delete it after a confirmation', async () => {
    const { onRefresh, actions } = setup()
    confirmMock.mockResolvedValue(true)
    deleteScheduledMessage.mockResolvedValue({ success: true })
    fireEvent.contextMenu(screen.getByText(/Service due soon/))
    fireEvent.click(await screen.findByText('Delete scheduled message'))
    await waitFor(() => expect(deleteScheduledMessage).toHaveBeenCalledWith('m1'))
    expect(confirmMock).toHaveBeenCalled()
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    // The day's own menu stayed shut: no "New work order" item appeared.
    expect(screen.queryByText(/New work order/)).not.toBeInTheDocument()
    expect(actions.onNewWorkOrder).not.toHaveBeenCalled()
  })

  it('does nothing when the delete is not confirmed', async () => {
    setup()
    confirmMock.mockResolvedValue(false)
    deleteScheduledMessage.mockClear()
    fireEvent.contextMenu(screen.getByText(/Service due soon/))
    fireEvent.click(await screen.findByText('Delete scheduled message'))
    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(deleteScheduledMessage).not.toHaveBeenCalled()
  })

  it('offers the same choices on right-click, with the slot time', async () => {
    const { columns, actions } = setup()
    fireEvent.contextMenu(columns[5], { clientX: 10, clientY: 840 })
    const item = await screen.findByText('New work order at 14:00')
    fireEvent.click(item)
    expect(actions.onNewWorkOrder).toHaveBeenCalledWith('2026-09-05', '14:00')
  })
})
