import type {
  EquipmentColumn,
  PrintableEquipment,
  PrintableEquipmentLists,
} from '@/features/equipment/Lib/equipmentPrint'
import { dayToDate } from '@/features/equipment/Lib/equipmentDays'
import { meterLine } from '@/features/meters/Lib/meterValue'
import { documentNumbers } from '@/lib/document-numbers'
import { DEFAULT_DATE_FORMAT, formatDateForPdf } from '@/lib/format'

/** One item as its row prints it: every column already worded, empty where unknown. */
export type EquipmentRow = Record<EquipmentColumn, string>

/** Both lists a design can choose between, as rows. */
export interface EquipmentPrint {
  job: EquipmentRow[]
  vehicle: EquipmentRow[]
}

/**
 * The Equipment section's rows, worded once for whichever list and columns
 * the design picks. Days print in the document's date format as the day they
 * are: a day key has no zone, so it is read at UTC and printed at UTC. The
 * year of manufacture prints as the year alone, and each meter as its own
 * line ("Engine hours: 812.5 hrs") in the document's number format. Nothing
 * when neither list has an item, so the section draws nothing at all.
 */
export function equipmentForPrint(
  lists: PrintableEquipmentLists | null | undefined,
  options: { dateFormat?: string; locale?: string }
): EquipmentPrint | undefined {
  if (!lists || (lists.job.length === 0 && lists.vehicle.length === 0)) return undefined
  const nums = documentNumbers(options.locale)
  const df = options.dateFormat || DEFAULT_DATE_FORMAT
  const day = (value: string | null) => (value ? formatDateForPdf(dayToDate(value), df, 'UTC') : '')
  const row = (item: PrintableEquipment): EquipmentRow => ({
    type: item.type,
    make: item.make ?? '',
    model: item.model ?? '',
    manufacture_year: item.manufactureYear != null ? String(item.manufactureYear) : '',
    serial_number: item.serialNumber ?? '',
    install_date: day(item.installDate),
    rated_capacity: item.ratedCapacity ?? '',
    last_examined: day(item.lastExaminedAt),
    next_examination: day(item.nextExaminationDue),
    certificate_reference: item.certificateReference ?? '',
    meters: item.meters.map((meter) => meterLine(meter, nums.meter)).join('\n'),
    notes: item.notes ?? '',
  })
  return { job: lists.job.map(row), vehicle: lists.vehicle.map(row) }
}
