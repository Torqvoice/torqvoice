/**
 * Guards the status strings that decide whether a job is still open.
 *
 * This is the exact bug the constant exists to prevent: a query filtered for
 * "in_progress" while the status select stores "in-progress". Nothing throws,
 * nothing logs, the picker just quietly offers no jobs to add a line to, and
 * the only symptom is somebody asking why they can only raise a separate bill.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { OPEN_SERVICE_STATUSES } from '@/lib/service-record'

/** The values the work order status select actually writes. */
function statusesFromEditor(): string[] {
  const source = readFileSync(
    'src/features/vehicles/Components/service-edit/InvoiceDetailsSection.tsx',
    'utf-8'
  )
  return [...source.matchAll(/<SelectItem value="([a-z-]+)">\{t\('statusOptions\./g)].map(
    (match) => match[1]
  )
}

describe('open service statuses', () => {
  it('covers every unfinished status the editor can set', () => {
    // The other direction is deliberately not asserted: the calendar and the
    // work board produce statuses the editor never offers, and those are
    // still open jobs.
    const offered = statusesFromEditor()
    expect(offered.length).toBeGreaterThan(0)
    for (const status of offered) {
      if (status === 'completed') continue
      expect([...OPEN_SERVICE_STATUSES]).toContain(status)
    }
  })

  it('leaves finished work out, so a line is never appended to it', () => {
    expect([...OPEN_SERVICE_STATUSES]).not.toContain('completed')
  })

  it('uses hyphens, the separator the editor writes', () => {
    // An underscore here matches no row in the database.
    for (const status of OPEN_SERVICE_STATUSES) {
      expect(status).not.toContain('_')
    }
  })
})
