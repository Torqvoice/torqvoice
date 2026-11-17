import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLogger, createRollup, formatLine } from '@/lib/logger'

const saved = process.env.LOG_LEVEL

function printed(): string[] {
  return [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls].map((c) =>
    c.map(String).join(' ')
  )
}

beforeEach(() => {
  delete process.env.LOG_LEVEL
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (saved === undefined) delete process.env.LOG_LEVEL
  else process.env.LOG_LEVEL = saved
})

describe('log lines', () => {
  it('reads [scope] message key=value, objects flattened, on one line', () => {
    expect(
      formatLine('platform-backup', 'Backup finished', {
        organizationId: 'org1',
        snapshot: '8984b7ced0f1',
        stats: { filesNew: 0, dataAdded: 613991 },
        at: new Date('2026-11-17T10:00:00Z'),
        skipped: undefined,
      })
    ).toBe(
      '[platform-backup] Backup finished organizationId=org1 snapshot=8984b7ced0f1 stats.filesNew=0 stats.dataAdded=613991 at=2026-11-17T10:00:00.000Z'
    )
  })

  it('quotes values with spaces and never lets a line break through', () => {
    const line = formatLine('backup', 'Run\nfailed', {
      error: 'Fatal: unable to open repository\nat s3:bucket',
      empty: '',
      list: ['a', 'b'],
    })
    expect(line).toBe(
      '[backup] Run failed error="Fatal: unable to open repository\\nat s3:bucket" empty="" list="[\\"a\\",\\"b\\"]"'
    )
    expect(line).not.toMatch(/[\r\n]/)
  })

  it('prints an error as its message and code; the stack only at debug, still on one line', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    createLogger('cron').error('Backup scheduler failed', { err })
    expect(printed()).toEqual([
      '[cron] Backup scheduler failed err="connect ECONNREFUSED" errCode=ECONNREFUSED',
    ])

    process.env.LOG_LEVEL = 'debug'
    createLogger('cron').error('Backup scheduler failed', { err })
    const withStack = printed()[1]
    expect(withStack).toContain('errStack="Error: connect ECONNREFUSED\\n')
    expect(withStack).not.toMatch(/[\r\n]/)
  })
})

describe('LOG_LEVEL', () => {
  function sayEverything() {
    const log = createLogger('cron')
    log.error('e')
    log.warn('w')
    log.info('i')
    log.debug('d')
  }

  it('is info by default: debug lines stay silent', () => {
    sayEverything()
    expect(printed()).toEqual(['[cron] w', '[cron] i', '[cron] e'])
  })

  it('debug brings the routine lines back', () => {
    process.env.LOG_LEVEL = 'DEBUG'
    sayEverything()
    expect(printed()).toContain('[cron] d')
  })

  it('error keeps only failures, and an unknown value means info', () => {
    process.env.LOG_LEVEL = 'error'
    sayEverything()
    expect(printed()).toEqual(['[cron] e'])
    vi.mocked(console.error).mockClear()
    for (const unknown of ['verbose', 'constructor', '__proto__']) {
      vi.mocked(console.warn).mockClear()
      vi.mocked(console.error).mockClear()
      process.env.LOG_LEVEL = unknown
      sayEverything()
      expect(printed()).toEqual(['[cron] w', '[cron] i', '[cron] e'])
    }
  })
})

describe('createRollup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'))
  })

  it('prints one line an hour with every count, zeros included, and is silent on an idle hour', () => {
    const rollup = createRollup('cron', 'Backups', { order: ['finished', 'failed'] })
    for (let i = 0; i < 12; i++) {
      rollup.add({ finished: 1 })
      vi.advanceTimersByTime(5 * 60_000)
    }
    expect(printed()).toEqual([])
    rollup.add({})
    expect(printed()).toEqual(['[cron] Backups: 12 finished, 0 failed over the last 60 min'])

    vi.advanceTimersByTime(60 * 60_000)
    rollup.add({})
    expect(printed()).toHaveLength(1)
  })
})
