export type WorkBoardJob = {
  id: string
  type: 'serviceRecord' | 'inspection'
  technicianId: string | null
  /** Bay the job occupies, independent of who works on it. */
  workBayId: string | null
  sortOrder: number
  title: string
  status: string
  startDateTime: string | null
  endDateTime: string | null
  /**
   * When the customer was told the vehicle would be ready, so a card can say
   * that the promise has passed. Always null for an inspection: only a
   * service record carries a promise.
   */
  promisedAt: string | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
    customer: { name: string } | null
  } | null
  /** Whose car it is, resolved through the vehicle or set directly. */
  customerName: string | null
  templateName?: string
}

export type WorkBay = {
  id: string
  name: string
  color: string
  isActive: boolean
  sortOrder: number
  dailyCapacity: number
  organizationId: string
}

export type WorkBoardSettings = {
  weekStartDay: number
  workDayStart: string
  workDayEnd: string
}
