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
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
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
