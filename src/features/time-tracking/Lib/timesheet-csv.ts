import { zonedParts } from '@/lib/timezone'
import { entryMinutes, formatMinutes, minutesToDecimalHours, type SheetEntry } from './timesheet'

/**
 * The sheet as a spreadsheet: one row per stretch, times on the workshop's
 * clock, hours both as h:mm and as a decimal so payroll can sum a column.
 */
export function timesheetCsv(
  entries: SheetEntry[],
  timeZone: string,
  now: Date,
  headers: string[]
): string {
  const cell = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const wall = (iso: string) => {
    const p = zonedParts(new Date(iso), timeZone)
    const d = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
    const t = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    return { d, t }
  }

  const rows = entries.map((e) => {
    const start = wall(e.startedAt)
    const end = e.endedAt ? wall(e.endedAt) : null
    const minutes = entryMinutes(e, now)
    return [
      e.technicianName,
      start.d,
      start.t,
      end ? (end.d === start.d ? end.t : `${end.d} ${end.t}`) : '',
      formatMinutes(minutes),
      minutesToDecimalHours(minutes),
      e.job.title,
      e.job.vehicleLabel ?? '',
      e.job.licensePlate ?? '',
      e.source,
      e.editedByName ?? '',
      e.note ?? '',
    ]
  })

  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n')
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
