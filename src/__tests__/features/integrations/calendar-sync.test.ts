import { describe, expect, it } from 'vitest'
import {
  draftCalendarEvent,
  pullWindow,
  type ServiceForCalendar,
  serviceUrl,
} from '@/features/integrations/Lib/calendar-sync'

const record: ServiceForCalendar = {
  id: 'svc1',
  title: 'Brake service',
  status: 'pending',
  startDateTime: new Date('2026-09-10T08:00:00Z'),
  endDateTime: new Date('2026-09-10T09:30:00Z'),
  invoiceNumber: 'INV-42',
  vehicleId: 'veh1',
  vehicle: { year: 2018, make: 'Toyota', model: 'Corolla', licensePlate: 'AB 12345' },
  customer: { name: 'Anna Berg', phone: '+4791234567' },
}

/**
 * A work order becomes the same calendar event whichever vendor it goes to.
 * The draft carries what a mechanic needs at a glance and a checksum so an
 * unchanged record is not pushed again.
 */
describe('calendar event drafting', () => {
  it('builds title, description and times from the work order', () => {
    const draft = draftCalendarEvent(record, {
      appUrl: 'https://shop.example.com',
      includeCustomer: true,
    })
    expect(draft).not.toBeNull()
    expect(draft?.title).toBe('Brake service · 2018 Toyota Corolla · Anna Berg')
    expect(draft?.description).toContain('Customer: Anna Berg')
    expect(draft?.description).toContain('Phone: +4791234567')
    expect(draft?.description).toContain('Vehicle: 2018 Toyota Corolla (AB 12345)')
    expect(draft?.description).toContain('Invoice: INV-42')
    expect(draft?.description).toContain('https://shop.example.com/vehicles/veh1/service/svc1')
    expect(draft?.start.toISOString()).toBe('2026-09-10T08:00:00.000Z')
    expect(draft?.end.toISOString()).toBe('2026-09-10T09:30:00.000Z')
  })

  it('leaves the customer out when asked', () => {
    const draft = draftCalendarEvent(record, { appUrl: 'https://x', includeCustomer: false })
    expect(draft?.title).toBe('Brake service · 2018 Toyota Corolla')
    expect(draft?.description).not.toContain('Phone:')
    // The name still helps the mechanic; only the phone is private.
    expect(draft?.description).toContain('Customer: Anna Berg')
  })

  it('defaults the end to an hour after the start', () => {
    const draft = draftCalendarEvent(
      { ...record, endDateTime: null },
      { appUrl: 'https://x', includeCustomer: true }
    )
    expect(draft?.end.toISOString()).toBe('2026-09-10T09:00:00.000Z')
    const backwards = draftCalendarEvent(
      { ...record, endDateTime: new Date('2026-09-10T07:00:00Z') },
      { appUrl: 'https://x', includeCustomer: true }
    )
    expect(backwards?.end.toISOString()).toBe('2026-09-10T09:00:00.000Z')
  })

  it('has no event for unscheduled or cancelled work', () => {
    expect(
      draftCalendarEvent(
        { ...record, startDateTime: null },
        { appUrl: 'https://x', includeCustomer: true }
      )
    ).toBeNull()
    expect(
      draftCalendarEvent(
        { ...record, status: 'cancelled' },
        { appUrl: 'https://x', includeCustomer: true }
      )
    ).toBeNull()
  })

  it('changes the checksum only when something visible changes', () => {
    const a = draftCalendarEvent(record, { appUrl: 'https://x', includeCustomer: true })
    const b = draftCalendarEvent({ ...record }, { appUrl: 'https://x', includeCustomer: true })
    const c = draftCalendarEvent(
      { ...record, title: 'Brake service and MOT' },
      { appUrl: 'https://x', includeCustomer: true }
    )
    expect(a?.checksum).toBe(b?.checksum)
    expect(a?.checksum).not.toBe(c?.checksum)
  })

  it('links sales without a vehicle to the sales page', () => {
    expect(serviceUrl('https://x', { id: 's', vehicleId: null })).toBe('https://x/sales/s')
  })

  it('pulls a week back and two months ahead', () => {
    const now = new Date('2026-09-02T12:00:00Z')
    const w = pullWindow(now)
    expect(w.from.toISOString()).toBe('2026-08-26T12:00:00.000Z')
    expect(w.to.toISOString()).toBe('2026-11-01T12:00:00.000Z')
  })
})
