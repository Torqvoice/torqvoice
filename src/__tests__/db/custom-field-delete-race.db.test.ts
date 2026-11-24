/**
 * Two custom fields deleted at the same moment, on a real PostgreSQL
 * (`npm run test:db` with E2E_DATABASE_URL set).
 *
 * Deleting a field takes it out of every saved layout. Each delete reads the
 * layout, drops its field and writes the layout back. Two at once could both
 * read the layout as it was, and the later write would put back the field
 * the earlier one took out. The layout rows are locked before they are read,
 * so the second waits for the first and reads what it wrote.
 *
 * It makes one person and one workshop of its own and removes them again.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": its name must say test or e2e, like the rest of this suite.`
  )
}

process.env.DATABASE_URL = url

const stamp = randomUUID().slice(0, 8)

let db: typeof import('@/lib/db')['db']
let drop: typeof import('@/features/custom-fields/Lib/dropFieldFromLayouts')['dropFieldFromLayouts']
let organizationId = ''
let userId = ''

const layout = {
  sections: [
    {
      id: 'general',
      visible: true,
      order: 0,
      fields: [
        { id: 'cf_one', visible: true },
        { id: 'cf_two', visible: true },
        { id: 'cf_kept', visible: true },
      ],
    },
  ],
}

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ dropFieldFromLayouts: drop } = await import(
    '@/features/custom-fields/Lib/dropFieldFromLayouts'
  ))
  const user = await db.user.create({
    data: { name: `Fields ${stamp}`, email: `fields-${stamp}@example.com` },
  })
  userId = user.id
  const organization = await db.organization.create({ data: { name: `Fields ${stamp}` } })
  organizationId = organization.id
  await db.appSetting.create({
    data: {
      userId,
      organizationId,
      key: 'invoice.layoutConfig',
      value: JSON.stringify(layout),
    },
  })
  await db.documentDesign.create({
    data: { organizationId, documentType: 'invoice', name: 'Mine', layout, template: {} },
  })
})

afterAll(async () => {
  if (organizationId) await db.organization.delete({ where: { id: organizationId } })
  if (userId) await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
})

const fieldsIn = (stored: unknown) => (stored as typeof layout).sections[0].fields.map((f) => f.id)

describe('two custom fields deleted at once', () => {
  it('leaves both out of the saved layouts', async () => {
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    // The first holds its transaction open after writing, long enough for the
    // second to start and read. Without the lock the second reads the layout
    // with the first field still in it, and writes that back.
    const first = db.$transaction(
      async (tx) => {
        await drop(tx, organizationId, 'one')
        await pause(800)
      },
      { timeout: 20_000 }
    )
    await pause(200)
    const second = db.$transaction((tx) => drop(tx, organizationId, 'two'), {
      timeout: 20_000,
    })
    await Promise.all([first, second])

    const setting = await db.appSetting.findFirstOrThrow({
      where: { organizationId, key: 'invoice.layoutConfig' },
    })
    expect(fieldsIn(JSON.parse(setting.value))).toEqual(['cf_kept'])
    const design = await db.documentDesign.findFirstOrThrow({ where: { organizationId } })
    expect(fieldsIn(design.layout)).toEqual(['cf_kept'])
  })
})
