'use client'

import { useTranslations } from 'next-intl'
import { entryMinutes, formatMinutes, type SheetEntry } from '../Lib/timesheet'

export interface PrintGroup {
  key: string
  label: string
  entries: SheetEntry[]
  minutes: number
}

/**
 * The timesheet as a paper form: the entries under their group headings with
 * a subtotal each, a total that is the sum of the rows, and somewhere to sign.
 * Styled by print-timesheet.ts, not by the app, so class names here are its.
 */
export function TimesheetPrintSheet({
  title,
  range,
  technician,
  zoneNote,
  groups,
  now,
  formatDate,
  formatTime,
}: {
  title: string
  range: string
  technician: string
  zoneNote: string
  groups: PrintGroup[]
  now: Date
  formatDate: (date: string) => string
  formatTime: (date: string) => string
}) {
  const t = useTranslations('timeTracking.page')
  const tSource = useTranslations('timeTracking.source')
  const total = groups.reduce((sum, group) => sum + group.minutes, 0)
  const sourceLabel = (entry: SheetEntry) => {
    const source =
      entry.source === 'manual'
        ? tSource('manual')
        : entry.source === 'web'
          ? tSource('web')
          : tSource('app')
    return entry.editedByName && entry.source !== 'manual'
      ? `${source} (${tSource('editedBy', { name: entry.editedByName })})`
      : source
  }
  const endLabel = (entry: SheetEntry) => {
    if (!entry.endedAt) return t('table.running')
    const day = formatDate(entry.endedAt)
    const time = formatTime(entry.endedAt)
    return day === formatDate(entry.startedAt) ? time : `${day} ${time}`
  }

  return (
    <div>
      <h1>{title}</h1>
      <p className="meta">
        {range} · {technician}
      </p>
      <p className="meta">{zoneNote}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('csv.date')}</th>
            <th scope="col">{t('table.time')}</th>
            <th scope="col">{t('csv.technician')}</th>
            <th scope="col">{t('client')}</th>
            <th scope="col">{t('table.vehicle')}</th>
            <th scope="col">{t('table.job')}</th>
            <th scope="col">{t('table.source')}</th>
            <th scope="col" className="num">
              {t('table.duration')}
            </th>
            <th scope="col">{t('table.note')}</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.key}>
            <tr className="group">
              <th scope="rowgroup" colSpan={7}>
                {group.label}
              </th>
              <th className="num">{formatMinutes(group.minutes)}</th>
              <th />
            </tr>
            {group.entries.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDate(entry.startedAt)}</td>
                <td>
                  {formatTime(entry.startedAt)} – {endLabel(entry)}
                </td>
                <td>{entry.technicianName}</td>
                <td>{entry.job.clientName}</td>
                <td>
                  {[entry.job.vehicleLabel ?? t('table.counterSale'), entry.job.licensePlate]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
                <td>{entry.job.title}</td>
                <td>{sourceLabel(entry)}</td>
                <td className="num">{formatMinutes(entryMinutes(entry, now))}</td>
                <td className="note">{entry.note}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr>
            <th scope="row" colSpan={7}>
              {t('stats.total')}
            </th>
            <th className="num">{formatMinutes(total)}</th>
            <th />
          </tr>
        </tfoot>
      </table>
      <div className="sign">
        <div>{t('csv.date')}</div>
        <div>{t('signature')}</div>
      </div>
    </div>
  )
}
