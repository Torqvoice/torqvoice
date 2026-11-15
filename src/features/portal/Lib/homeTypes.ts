/**
 * What the portal home shows, in one shape.
 *
 * The home action builds this once on the server and each theme's Home draws
 * it, so the four themes never show different facts: they only arrange them
 * differently.
 *
 * Every date is an ISO string and every amount a number in the workshop's
 * currency: a Home formats them through `PortalHomeFormat`, which is built on
 * the workshop's time zone and currency in the portal's language. Every list
 * can be empty, and a Home must look finished when all of them are.
 */

import type { PortalOpeningHours } from '../Actions/portalActions'
import type { PortalChatMessage } from './chatTypes'

export interface PortalHomeVehicle {
  id: string
  /** "Volvo V60": make and model, as the customer says it. */
  label: string
  licensePlate: string | null
}

/** Where a job is, as three steps a customer understands. */
export type PortalJobStage = 'booked' | 'working' | 'ready'

/** The latest thing the workshop shared about a job: words, photos, a video. */
export interface PortalHomeUpdate {
  /** When it reached the customer. */
  at: string
  /** The shared page that shows it in full. */
  url: string
  /** What the workshop wrote, when it wrote anything. Plain text, may be long. */
  message: string | null
}

/** Work that is booked or under way. Finished work is an invoice. */
export interface PortalHomeJob {
  id: string
  title: string
  /** The stored status: pending, scheduled, in-progress, waiting-parts. */
  status: string
  stage: PortalJobStage
  vehicle: PortalHomeVehicle | null
  /** When the car is expected in, when one is set. */
  startAt: string | null
  /** When the workshop promised it back, when it has. */
  promisedAt: string | null
  /** The latest update the workshop shared for this job, when there is one. */
  update: PortalHomeUpdate | null
}

/** A finished job the customer still owes money on. */
export interface PortalHomeInvoice {
  id: string
  invoiceNumber: string | null
  title: string
  vehicle: PortalHomeVehicle | null
  /** The day of the work. */
  date: string
  total: number
  paid: number
  /** total minus paid; always above zero here. */
  balance: number
  dueAt: string | null
  overdue: boolean
  /** The invoice read inside the portal. */
  viewUrl: string
  /** The shared invoice page where paying online lives, when it can be paid there. */
  payUrl: string | null
}

/** A quote sent to the customer and not yet answered or expired. */
export interface PortalHomeQuote {
  id: string
  quoteNumber: string | null
  title: string
  vehicle: PortalHomeVehicle | null
  total: number
  validUntil: string | null
  /** Where the customer reads and answers it, inside the portal. */
  url: string
}

/** Something the customer asked for that the workshop has not acted on yet. */
export interface PortalHomeRequest {
  id: string
  description: string
  vehicle: PortalHomeVehicle | null
  createdAt: string
  preferredDate: string | null
}

/** The next time the customer is expected at the workshop. */
export interface PortalHomeVisit {
  id: string
  /** A booked job, or an appointment the workshop made with the customer. */
  kind: 'job' | 'appointment'
  title: string
  startAt: string
  vehicle: PortalHomeVehicle | null
}

/** One of the customer's cars (or boats). */
export interface PortalHomeCar {
  id: string
  /** "Volvo V60". */
  label: string
  licensePlate: string | null
  year: number | null
  /** How many times it has been in: every work order on it, open or done. */
  visits: number
  /** A job on it is under way right now. */
  inWorkshop: boolean
  /** The workshop's warranty on some work still runs; 'expiring' within 30 days. */
  warranty: 'active' | 'expiring' | null
  /** Its page in the portal. */
  url: string
}

export type PortalTireSeason = 'summer' | 'winter' | 'all_season' | 'other'

/** A set of tyres the workshop is storing for the customer. */
export interface PortalHomeTireSet {
  id: string
  season: PortalTireSeason
  /** Studded winter tyres. */
  studded: boolean
  brand: string | null
  model: string | null
  /** As the workshop wrote it: "225/60 R18". */
  size: string | null
  /** How many tyres are in the set; usually four. */
  quantity: number
  /** Mounted on rims. */
  withRims: boolean
  /**
   * The shallowest tread at the latest measuring, in millimetres. Print it
   * with `format.tread`, which knows the workshop's unit. Null when the
   * workshop never measured.
   */
  treadDepthMm: number | null
  /** When the set came in. */
  storedSince: string | null
  /** The car it belongs to, when it is one of the customer's. */
  vehicle: PortalHomeVehicle | null
}

/** The chat with the workshop, as the home starts with it. */
export interface PortalHomeMessages {
  /** False when the workshop turned the chat off: show nothing about it. */
  enabled: boolean
  /** Messages from the workshop the customer has not opened. */
  unread: number
  /** The end of the thread, oldest first; empty before the first message. */
  latest: PortalChatMessage[]
}

/** The workshop, as every signed-in page and the sign-in page know it. */
export interface PortalWorkshop {
  name: string
  /** The workshop's logo, when it has one. */
  logoUrl: string | null
  phone: string | null
  /** The phone as a `tel:` address, when there is one. */
  phoneHref: string | null
  email: string | null
  address: string | null
  /** A map link to the address, when there is one. */
  directionsUrl: string | null
  /** Today's opening hours as "HH:mm" pairs; empty when closed today. */
  openToday: { start: string; end: string }[]
  /** True while the workshop is open right now, on its own clock. */
  openNow: boolean
  /**
   * "HH:mm" the stretch the workshop is in right now ends: 12:00 at ten in
   * the morning for a workshop that shuts for lunch, not the evening's
   * closing. Null while it is not open.
   */
  closesAt: string | null
  /**
   * "HH:mm" of the next opening later today, while the workshop has not
   * opened yet (or is on a break). Null when it is open now or has closed
   * for the day.
   */
  opensAt: string | null
  /**
   * Today's hours as one ready sentence in the portal's language and the
   * workshop's clock: "Open until 17:00", "Opens at 08:00", "Closed for
   * today", "Closed today".
   */
  openLine: string
  /** The week and the days soon it is shut; null when it could not be read. */
  hours: PortalOpeningHours | null
}

export interface PortalHomeData {
  customerName: string
  /** "Kari" of "Kari Nordmann", for a greeting. */
  customerFirstName: string
  /** The workshop works on boats, so every "car" on the home reads "boat". */
  marine: boolean
  workshop: PortalWorkshop
  /**
   * Work that is booked or under way: under way first (the one promised
   * soonest on top), then booked by start time. `jobs[0]` is what a Home
   * leads with.
   */
  jobs: PortalHomeJob[]
  /**
   * The next time the customer is expected, other than what `jobs[0]`
   * already says: the soonest booked job or appointment from today on.
   */
  nextVisit: PortalHomeVisit | null
  /** Soonest to expire first. */
  toAnswer: PortalHomeQuote[]
  /** Overdue first, then by due date. */
  toPay: PortalHomeInvoice[]
  /** The sum of every balance in `toPay`: what the customer owes in all. */
  toPayTotal: number
  /** How many invoices are in `toPay`. */
  toPayCount: number
  /** How many of them are past their due day. `toPay[0]` is the most urgent: overdue first, else next due. */
  toPayOverdueCount: number
  /** The customer's cars: the ones in the workshop first, then by name. */
  cars: PortalHomeCar[]
  /**
   * Tyres stored for the customer. Null when the workshop runs no tyre hotel
   * or hides it from customers: then a Home draws nothing about tyres. An
   * empty list means the module is on and nothing is stored.
   */
  tires: PortalHomeTireSet[] | null
  /** Newest first. */
  requests: PortalHomeRequest[]
  messages: PortalHomeMessages
}

/**
 * How the home prints dates, times and money: the workshop's time zone and
 * currency in the portal's language. Built once on the server
 * (`portalFormat`) and handed to the Home, which is a server component too:
 * it holds functions, so it cannot be passed to a client component.
 */
export interface PortalHomeFormat {
  money: (amount: number) => string
  /** "3 Dec" or "3 Dec 2027" when the year is not this one. */
  day: (iso: string) => string
  /** "Thursday 3 December". */
  dayLong: (iso: string) => string
  /** "08:00" or "8:00 AM", as the workshop set its clock. */
  time: (iso: string) => string
  /** "today", "tomorrow" or the day, for a sentence like "ready today around 15:00". */
  relativeDay: (iso: string) => string
  /** A bare "HH:mm" in the workshop's 12 or 24 hour form. */
  clock: (hhmm: string) => string
  /** True when the day is before today on the workshop's calendar: a due date that has passed. */
  isPast: (iso: string) => boolean
  /** A tread depth in the workshop's unit: "5 mm" or "6/32″". */
  tread: (mm: number) => string
}
