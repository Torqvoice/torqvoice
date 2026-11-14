/**
 * A status has one colour across the app. Work order, quote and inspection
 * statuses are coloured in src/lib/status-colors.ts and drawn with
 * StatusBadge; these tests fail when a screen starts keeping a colour table
 * of its own again, which is how pending came to be yellow in one list,
 * amber in another and grey on the vehicle page.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INSPECTION_STATUS_COLORS,
  QUOTE_STATUS_COLORS,
  statusBadgeClass,
  statusColor,
  WORK_ORDER_STATUS_COLORS,
} from '@/lib/status-colors'
import { statusBlockColor } from '@/features/workboard/utils/job-colors'

const SRC = join(process.cwd(), 'src')

/**
 * Files that colour a status of some other thing, which happens to share a
 * word with a work order or a quote. Each says what it colours; a new entry
 * here needs the same.
 */
const OTHER_THINGS: Record<string, string> = {
  'lib/status-colors.ts': 'the one table',
  'features/workboard/utils/job-colors.ts': 'the work board blocks, held to the same hues below',
  'features/tire-hotel/Lib/treatments.ts': 'a tyre treatment: pending, done, skipped',
  'features/status-reports/Components/StatusReportList.tsx':
    'a status report: draft, published, sent',
  'app/(authenticated)/vehicles/inspection-reminders/[id]/campaign-detail.tsx':
    'one send of a reminder campaign: sent, failed, scheduled',
  'app/(authenticated)/vehicles/[id]/_classic/service-records-table.tsx':
    'a warranty: active, expiring, expired',
  'app/(public)/portal/[orgId]/vehicles/[vehicleId]/page.tsx':
    'a warranty: active, expiring, expired',
}

const STATUS_WORDS = [
  ...Object.keys(WORK_ORDER_STATUS_COLORS),
  ...Object.keys(QUOTE_STATUS_COLORS),
  ...Object.keys(INSPECTION_STATUS_COLORS),
  'in_progress',
  'waiting_parts',
]

/** `pending: 'bg-yellow-500/10 …'`: a status as a key, a Tailwind colour as its value. */
const OWN_TABLE = new RegExp(
  `^\\s*['"]?(${[...new Set(STATUS_WORDS)].join('|')})['"]?:\\s*['"\`][^'"\`]*\\b(bg|text|border)-[a-z]+-\\d`
)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__' || name === 'generated' || name === 'node_modules') return []
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('status colours', () => {
  it('are kept in one table and nowhere else', () => {
    const offenders = sourceFiles(SRC).flatMap((path) => {
      const file = relative(SRC, path)
      if (OTHER_THINGS[file]) return []
      return readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (OWN_TABLE.test(line) ? [`${file}:${i + 1}  ${line.trim()}`] : []))
    })
    expect(offenders).toEqual([])
  })

  it('still names only files that exist', () => {
    const files = new Set(sourceFiles(SRC).map((path) => relative(SRC, path)))
    expect(Object.keys(OTHER_THINGS).filter((file) => !files.has(file))).toEqual([])
  })

  it('give every stored work order status a colour, however it is spelt', () => {
    for (const status of ['pending', 'scheduled', 'in-progress', 'waiting-parts', 'completed']) {
      expect(statusBadgeClass('workOrder', status), status).not.toBe('')
    }
    // Older rows and the tyre jobs spell these with underscores.
    expect(statusBadgeClass('workOrder', 'in_progress')).toBe(
      statusBadgeClass('workOrder', 'in-progress')
    )
    expect(statusBadgeClass('workOrder', 'waiting_parts')).toBe(
      statusBadgeClass('workOrder', 'waiting-parts')
    )
    expect(statusBadgeClass('inspection', 'in_progress')).toBe(
      statusBadgeClass('workOrder', 'in-progress')
    )
  })

  it('give every quote status a colour', () => {
    for (const status of [
      'draft',
      'sent',
      'changes_requested',
      'accepted',
      'rejected',
      'expired',
      'converted',
    ]) {
      expect(statusBadgeClass('quote', status), status).not.toBe('')
    }
  })

  it('leave a status nobody has coloured plain, rather than guess', () => {
    expect(statusBadgeClass('workOrder', 'ready-for-pickup')).toBe('')
  })

  it('fill the work board blocks with the same hue as the badges', () => {
    for (const status of Object.keys(WORK_ORDER_STATUS_COLORS)) {
      const hue = statusColor('workOrder', status)?.hue
      expect(statusBlockColor(status), status).toContain(`bg-${hue}-`)
    }
  })
})
