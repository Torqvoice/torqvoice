/**
 * Equipment as a printed document carries it, unformatted: days are day
 * keys, readings plain numbers. Shared by the server that gathers it, the
 * issued invoice that freezes it and the print builders that lay it out.
 */
export interface PrintableEquipment {
  type: string
  make: string | null
  model: string | null
  serialNumber: string | null
  manufactureYear: number | null
  installDate: string | null
  ratedCapacity: string | null
  nextExaminationDue: string | null
  lastExaminedAt: string | null
  certificateReference: string | null
  notes: string | null
  meters: { name: string; unit: string; value: number }[]
}

/** Both lists a design can choose between. */
export interface PrintableEquipmentLists {
  /** The items the job or quote works on. */
  job: PrintableEquipment[]
  /** Everything on the vehicle now. */
  vehicle: PrintableEquipment[]
}

/** The columns an Equipment section can print, in their default order. */
export const EQUIPMENT_COLUMNS = [
  'type',
  'make',
  'model',
  'manufacture_year',
  'serial_number',
  'install_date',
  'rated_capacity',
  'last_examined',
  'next_examination',
  'certificate_reference',
  'meters',
  'notes',
] as const

export type EquipmentColumn = (typeof EQUIPMENT_COLUMNS)[number]

/** On when the section is first switched on: the columns of the sample invoice. */
export const DEFAULT_EQUIPMENT_COLUMNS: EquipmentColumn[] = [
  'type',
  'make',
  'model',
  'manufacture_year',
  'serial_number',
]
