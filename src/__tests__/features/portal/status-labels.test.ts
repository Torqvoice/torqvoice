import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { portalStatusLabel } from '@/features/portal/Lib/statusLabels'

/**
 * The portal names a job's, a request's and an inspection's status in the
 * customer's words and language. It used to print the stored value, so a
 * customer read "in-progress" or "in_progress" whatever their language.
 */

const read = (locale: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', locale, 'portal.json'), 'utf8'))
const LOCALES = fs.readdirSync(path.join(process.cwd(), 'messages'))
const tFor = (locale: string) => (key: string) =>
  key.split('.').reduce((o, k) => o?.[k], read(locale).status) as string

describe('statuses in the customer portal', () => {
  const t = tFor('en')

  it('names the statuses a customer meets in plain words', () => {
    expect(portalStatusLabel('job', 'in-progress', t)).toBe('In progress')
    expect(portalStatusLabel('job', 'waiting-parts', t)).toBe('Waiting for parts')
    expect(portalStatusLabel('job', 'pending', t)).toBe('Booked')
    expect(portalStatusLabel('request', 'converted', t)).toBe('Booked')
    expect(portalStatusLabel('request', 'cancelled', t)).toBe('Cancelled')
    expect(portalStatusLabel('inspection', 'in_progress', t)).toBe('In progress')
  })

  it('tidies a status it does not know rather than showing the stored value', () => {
    expect(portalStatusLabel('job', 'on_hold', t)).toBe('On hold')
  })

  it.each(LOCALES)('%s has a word for every status', (locale) => {
    const tl = tFor(locale)
    for (const [kind, statuses] of Object.entries({
      job: ['pending', 'scheduled', 'in-progress', 'waiting-parts', 'completed'],
      request: ['pending', 'converted', 'dismissed', 'cancelled'],
      inspection: ['in_progress', 'completed'],
    })) {
      for (const status of statuses) {
        const label = portalStatusLabel(kind as 'job', status, tl)
        expect(label, `${locale} ${kind} ${status}`).toEqual(expect.any(String))
        expect(label).not.toMatch(/[-_]/)
      }
    }
  })
})
