'use client'

import { createContext, useContext } from 'react'

/**
 * Booking from anywhere.
 *
 * The desk has a customer on the phone and may be on any screen. Whatever
 * made or found the vehicle (the plate lookup, the vehicle form, the + menu)
 * asks for the booking dialog here, with the vehicle and customer it already
 * has, so nobody searches for the same car twice.
 */

/** A vehicle as the pickers show it. */
export interface BookingVehicle {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  customerId: string | null
  customer: { id: string; name: string } | null
}

export interface BookingCustomer {
  id: string
  name: string
  company: string | null
}

/** What a booking opened from outside the calendar starts with. */
export interface BookingStart {
  vehicle?: BookingVehicle | null
  customer?: BookingCustomer | null
}

export interface BookingAccess {
  /** The signed-in account may book: it can create work orders. */
  canBook: boolean
}

const BookingAccessContext = createContext<BookingAccess>({ canBook: false })

/** Resolved once in the layout, like the plate lookup's access. */
export function BookingAccessProvider({
  value,
  children,
}: {
  value: BookingAccess
  children: React.ReactNode
}) {
  return <BookingAccessContext.Provider value={value}>{children}</BookingAccessContext.Provider>
}

export function useBookingAccess() {
  return useContext(BookingAccessContext)
}

/** The event a "Book appointment" anywhere fires; the host in the layout listens for it. */
export const BOOKING_EVENT = 'torqvoice:booking'

export function openBooking(start?: BookingStart) {
  document.dispatchEvent(new CustomEvent(BOOKING_EVENT, { detail: start ?? {} }))
}
