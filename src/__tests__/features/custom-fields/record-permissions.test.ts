/**
 * @vitest-environment node
 *
 * A record's custom fields follow the record, not the Settings permission.
 *
 * Defining a field is a setting. Filling one in is part of the work order or
 * the quote, like its title. All of it used to need Settings, so a Member who
 * could edit a work order saw none of the workshop's custom fields on it,
 * could not have saved one, and was refused on every page load.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  customFieldDefinition: { findMany: vi.fn() },
  customFieldValue: { findMany: vi.fn(), upsert: vi.fn() },
  serviceRecord: { count: vi.fn() },
  quote: { count: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db }))

const seenOptions = vi.hoisted(() => [] as { requiredPermissions?: unknown }[])
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    action: (ctx: { userId: string; organizationId: string }) => unknown,
    options: { requiredPermissions?: unknown } = {}
  ) => {
    seenOptions.push(options)
    try {
      return { success: true, data: await action({ userId: 'u-1', organizationId: 'org-1' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/features', () => ({ requireFeature: vi.fn() }))

import {
  getCustomFieldValues,
  getFieldDefinitions,
  saveCustomFieldValues,
} from '@/features/custom-fields/Actions/customFieldActions'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

const needed = () => seenOptions.at(-1)?.requiredPermissions

beforeEach(() => {
  seenOptions.length = 0
  db.customFieldDefinition.findMany.mockReset().mockResolvedValue([{ id: 'f-1', defaultValue: '' }])
  db.customFieldValue.findMany.mockReset().mockResolvedValue([])
  db.customFieldValue.upsert.mockReset().mockReturnValue('upsert')
  db.serviceRecord.count.mockReset().mockResolvedValue(1)
  db.quote.count.mockReset().mockResolvedValue(1)
  db.$transaction.mockReset().mockResolvedValue([])
})

describe("reading a record's custom fields", () => {
  it('needs what reading the work order needs', async () => {
    const result = await getCustomFieldValues('job-1', 'service_record')
    expect(result.success).toBe(true)
    expect(needed()).toEqual([
      { action: PermissionAction.READ, subject: PermissionSubject.SERVICES },
    ])
  })

  it('needs what reading the quote needs', async () => {
    await getCustomFieldValues('q-1', 'quote')
    expect(needed()).toEqual([{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }])
  })

  it("draws the form for one kind of record on that record's permission", async () => {
    await getFieldDefinitions('service_record')
    expect(needed()).toEqual([
      { action: PermissionAction.READ, subject: PermissionSubject.SERVICES },
    ])
  })

  it('keeps the whole list, which is the settings screen, behind Settings', async () => {
    await getFieldDefinitions()
    expect(needed()).toEqual([
      { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
    ])
  })
})

describe('filling them in', () => {
  it('needs what saving the work order needs', async () => {
    const result = await saveCustomFieldValues('job-1', 'service_record', { 'f-1': 'Blue' })
    expect(result.success).toBe(true)
    expect(needed()).toEqual([
      { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
    ])
    expect(db.customFieldValue.upsert).toHaveBeenCalledTimes(1)
  })

  it('needs what saving the quote needs', async () => {
    await saveCustomFieldValues('q-1', 'quote', { 'f-1': 'Blue' })
    expect(needed()).toEqual([
      { action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES },
    ])
  })
})

describe("a record that is not this workshop's", () => {
  it('cannot be read', async () => {
    db.serviceRecord.count.mockResolvedValue(0)

    const result = await getCustomFieldValues('somebody-elses-job', 'service_record')

    expect(result).toEqual({ success: false, error: 'Record not found' })
    expect(db.serviceRecord.count).toHaveBeenCalledWith({
      where: { id: 'somebody-elses-job', organizationId: 'org-1' },
    })
    expect(db.customFieldValue.findMany).not.toHaveBeenCalled()
  })

  it('cannot have values attached to it', async () => {
    db.quote.count.mockResolvedValue(0)

    const result = await saveCustomFieldValues('somebody-elses-quote', 'quote', { 'f-1': 'x' })

    expect(result).toEqual({ success: false, error: 'Record not found' })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe('a kind of record nobody defined', () => {
  it('falls back to the strictest permission, and is refused anyway', async () => {
    const read = await getCustomFieldValues('x', 'customer')
    expect(needed()).toEqual([
      { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
    ])
    expect(read).toEqual({ success: false, error: 'Unknown record type' })

    const saved = await saveCustomFieldValues('x', 'customer', { 'f-1': 'x' })
    expect(needed()).toEqual([
      { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
    ])
    expect(saved).toEqual({ success: false, error: 'Unknown record type' })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })
})
