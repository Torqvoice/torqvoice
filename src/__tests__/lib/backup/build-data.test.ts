/**
 * @vitest-environment node
 */
import { Writable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  calls: [] as { model: string; args: Record<string, any> }[],
  /** Pages each model returns in turn; empty once used up. */
  pages: {} as Record<string, unknown[][]>,
}))

vi.mock('@/lib/db', () => ({
  db: new Proxy(
    {},
    {
      get: (_target, model: string) => ({
        findMany: async (args: Record<string, any>) => {
          state.calls.push({ model, args })
          return state.pages[model]?.shift() ?? []
        },
      }),
    }
  ),
}))

import {
  BACKUP_DATASET_KEYS,
  type BuildDataOptions,
  DEFAULT_OPTIONS,
  writeBackupData,
} from '@/lib/backup/build-data'
import { REDACTED } from '@/lib/backup/secrets'

const ALL: BuildDataOptions = { ...DEFAULT_OPTIONS, includeSecrets: false }
const NONE = Object.fromEntries(
  Object.keys(ALL).map((k) => [k, false])
) as unknown as BuildDataOptions

/** Collects the output, with a tiny buffer so the writer has to wait for drain. */
function sink() {
  let text = ''
  const out = new Writable({
    highWaterMark: 8,
    write(chunk, _enc, cb) {
      text += chunk.toString()
      setImmediate(cb)
    },
  })
  return { out, text: () => text }
}

async function run(options: BuildDataOptions) {
  const { out, text } = sink()
  const result = await writeBackupData('org-1', options, out)
  await new Promise<void>((resolve) => out.end(resolve))
  return { result, json: JSON.parse(text()), raw: text() }
}

beforeEach(() => {
  state.calls = []
  state.pages = {}
})

describe('organisation scope', () => {
  it('filters every dataset query by the organisation', async () => {
    const { result } = await run(ALL)

    expect(result.datasets).toEqual([...BACKUP_DATASET_KEYS])
    expect(state.calls.length).toBe(BACKUP_DATASET_KEYS.length)
    for (const call of state.calls) {
      expect(call.args.where?.organizationId, call.model).toBe('org-1')
      expect(call.args.orderBy, call.model).toEqual({ id: 'asc' })
      expect(call.args.take, call.model).toBeGreaterThan(0)
    }
  })

  it('refuses to run without an organisation', async () => {
    const { out } = sink()
    await expect(writeBackupData('', ALL, out)).rejects.toThrow()
    expect(state.calls).toEqual([])
  })

  it('emits the dataset names the import reads, in order', async () => {
    const { json } = await run(ALL)
    expect(Object.keys(json.data)).toEqual([
      'settings',
      'documentDesigns',
      'emailTemplates',
      'customers',
      'documentDesignSnapshots',
      'documentAssetSnapshots',
      'customFieldDefinitions',
      'inventoryParts',
      'vehicles',
      'orgReminders',
      'counterSales',
      'quotes',
      'technicians',
      'workBays',
      'inspectionTemplates',
      'inspections',
      'tireWarehouses',
      'tireSets',
      'workOrderStatuses',
      'conditionMarkTypes',
      'laborPresets',
      'webhooks',
      'reportSchedules',
      'roles',
      'auditLogs',
      'smsMessages',
      'whatsappMessages',
      'telegramMessages',
      'emailMessages',
      'scheduledMessages',
      'inspectionReminderCampaigns',
      'inspectionReminderSends',
      'notifications',
    ])
  })
})

describe('JSON shape', () => {
  it('writes the file the import reads', async () => {
    const createdAt = new Date('2026-10-01T08:00:00.000Z')
    state.pages.customer = [[{ id: 'c1', name: 'Ada', createdAt, organizationId: 'org-1' }]]
    state.pages.documentAssetSnapshot = [
      [{ id: 'a1', organizationId: 'org-1', data: new Uint8Array([1, 2, 3]) }],
    ]

    const { json, raw, result } = await run({
      ...NONE,
      customers: true,
      vehicles: true,
    })

    expect(raw.startsWith('{"version":2,"exportedAt":"')).toBe(true)
    expect(raw).not.toContain('\n')
    expect(json).toEqual({
      version: 2,
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      contents: 'data',
      data: {
        customers: [
          { id: 'c1', name: 'Ada', createdAt: '2026-10-01T08:00:00.000Z', organizationId: 'org-1' },
        ],
        documentDesignSnapshots: [],
        documentAssetSnapshots: [{ id: 'a1', organizationId: 'org-1', data: 'AQID' }],
        vehicles: [],
        orgReminders: [],
        counterSales: [],
      },
    })
    expect(result.rows).toBe(2)
  })

  it('says in the header whether the secrets are in it, before the data', async () => {
    const dataOnly = await run(NONE)
    expect(dataOnly.json.contents).toBe('data')
    expect(dataOnly.raw).toMatch(/^\{"version":2,"exportedAt":"[^"]+","contents":"data","data":\{/)

    const full = await run({ ...NONE, includeSecrets: true })
    expect(full.json.contents).toBe('dataAndSecrets')
    expect(full.raw).toMatch(
      /^\{"version":2,"exportedAt":"[^"]+","contents":"dataAndSecrets","data":\{/
    )
  })

  it('marks a "Data only" file even when there was no secret to leave out', async () => {
    state.pages.appSetting = [[{ id: 's1', key: 'workshop.name', value: 'Shop' }]]
    const { json } = await run({ ...NONE, settings: true })
    expect(json.data.settings).toEqual([{ id: 's1', key: 'workshop.name', value: 'Shop' }])
    expect(json.contents).toBe('data')
  })

  it('writes an empty data object when nothing is selected', async () => {
    const { json } = await run(NONE)
    expect(json.data).toEqual({})
    expect(state.calls).toEqual([])
  })

  it('keeps the nested trees the export always carried', async () => {
    await run({ ...NONE, vehicles: true, tireHotel: true })
    const vehicle = state.calls.find((c) => c.model === 'vehicle')?.args
    expect(vehicle?.include.serviceRecords.include).toMatchObject({
      concerns: true,
      timeEntries: true,
      statusReports: true,
    })
    const reminders = state.calls.find((c) => c.model === 'reminder')?.args
    expect(reminders?.where).toEqual({ organizationId: 'org-1', vehicleId: null })
    const tireSet = state.calls.find((c) => c.model === 'tireSet')?.args
    expect(tireSet?.include.measurements).toEqual({ include: { images: true } })
  })
})

describe('paging', () => {
  it('reads by id cursor until a short page', async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({
      id: `n${String(i).padStart(4, '0')}`,
      organizationId: 'org-1',
    }))
    state.pages.notification = [full, [{ id: 'n9999', organizationId: 'org-1' }]]

    const { json, result } = await run({ ...NONE, notifications: true })

    const calls = state.calls.filter((c) => c.model === 'notification')
    expect(calls).toHaveLength(2)
    expect(calls[0].args.cursor).toBeUndefined()
    expect(calls[1].args).toMatchObject({ cursor: { id: 'n0499' }, skip: 1, take: 500 })
    expect(json.data.notifications).toHaveLength(501)
    expect(result.rows).toBe(501)
  })
})

describe('secrets', () => {
  const settings = [
    { id: 's1', key: 'payment.stripe.secretKey', value: 'sk_live_x', organizationId: 'org-1' },
    { id: 's2', key: 'workshop.phone', value: '+47 123', organizationId: 'org-1' },
  ]
  const webhooks = [{ id: 'w1', url: 'https://x.test', secret: 'whsec_x', organizationId: 'org-1' }]

  it('redacts secret settings and webhook secrets by default', async () => {
    state.pages.appSetting = [settings]
    state.pages.webhook = [webhooks]
    const { json, raw } = await run({ ...NONE, settings: true, workshopConfig: true })

    expect(json.data.settings).toEqual([{ ...settings[0], value: REDACTED }, settings[1]])
    expect(json.data.webhooks).toEqual([{ ...webhooks[0], secret: REDACTED }])
    expect(raw).not.toContain('sk_live_x')
    expect(raw).not.toContain('whsec_x')
  })

  it('writes them in full when asked', async () => {
    state.pages.appSetting = [settings]
    state.pages.webhook = [webhooks]
    const { json } = await run({
      ...NONE,
      settings: true,
      workshopConfig: true,
      includeSecrets: true,
    })

    expect(json.data.settings).toEqual(settings)
    expect(json.data.webhooks).toEqual(webhooks)
  })
})
