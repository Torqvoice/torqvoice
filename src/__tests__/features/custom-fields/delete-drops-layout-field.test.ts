/**
 * @vitest-environment node
 *
 * Deleting a custom field used to leave it in the saved invoice layout: the
 * definition was gone, but the arrangement still listed it, switched on, in
 * General. It now leaves every arrangement that named it, and nothing else
 * about those arrangements changes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: [] as { id: string; key: string; value: string }[],
  designs: [] as { id: string; layout: unknown }[],
  writes: [] as { model: string; where: unknown; data: Record<string, unknown> }[],
  deleted: [] as string[],
}))

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(async () => ({ user: { id: 'user-a', email: 'a@x.test' } })),
  getCachedMembership: vi.fn(async () => ({
    organizationId: 'org-a',
    role: 'owner',
    roleId: null,
    customRole: null,
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(), auditDetails: vi.fn(() => undefined) }))
vi.mock('@/lib/features', () => ({
  requireFeature: vi.fn(),
  getFeatures: vi.fn(async () => ({})),
}))

vi.mock('@/lib/db', () => {
  const tx = {
    user: { findUnique: async () => ({ isSuperAdmin: false }) },
    customFieldDefinition: {
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        where.id === 'def-1' && where.organizationId === 'org-a'
          ? { id: 'def-1', name: 'insurance_no' }
          : null,
      delete: async ({ where }: { where: { id: string } }) => {
        state.deleted.push(where.id)
        return {}
      },
    },
    customFieldValue: { deleteMany: async () => ({ count: 0 }) },
    appSetting: {
      findMany: async ({ where }: { where: { organizationId: string } }) =>
        where.organizationId === 'org-a' ? state.settings : [],
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        state.writes.push({ model: 'appSetting', ...args })
        return {}
      },
    },
    documentDesign: {
      findMany: async ({ where }: { where: { organizationId: string } }) =>
        where.organizationId === 'org-a' ? state.designs : [],
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        state.writes.push({ model: 'documentDesign', ...args })
        return {}
      },
    },
  }
  return {
    db: {
      ...tx,
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    },
  }
})

import { deleteFieldDefinition } from '@/features/custom-fields/Actions/customFieldActions'
import { layoutWithoutField } from '@/features/custom-fields/Lib/dropFieldFromLayouts'

const layout = (generalVisible: boolean, extra: { id: string; visible: boolean }[] = []) => ({
  version: 2,
  sections: [
    { id: 'header', visible: true, order: 0 },
    {
      id: 'customer',
      visible: true,
      order: 1,
      fields: [{ id: 'customer_name', visible: true }, ...extra],
    },
    {
      id: 'general',
      visible: generalVisible,
      order: 2,
      fields: [
        { id: 'cf_def-1', visible: true },
        { id: 'cf_def-2', visible: true },
      ],
    },
  ],
})

beforeEach(() => {
  state.settings = []
  state.designs = []
  state.writes = []
  state.deleted = []
})

describe('deleting a custom field', () => {
  it('drops it from the saved invoice layout and the saved designs', async () => {
    state.settings = [
      { id: 's-1', key: 'invoice.layoutConfig', value: JSON.stringify(layout(true)) },
      // A layout that never placed the field is not written at all.
      {
        id: 's-2',
        key: 'quote.layoutConfig',
        value: JSON.stringify({ sections: [{ id: 'general', visible: false, order: 0 }] }),
      },
    ]
    state.designs = [{ id: 'd-1', layout: layout(false, [{ id: 'cf_def-1', visible: true }]) }]

    expect((await deleteFieldDefinition('def-1')).success).toBe(true)
    expect(state.deleted).toEqual(['def-1'])

    expect(state.writes.map((w) => w.model)).toEqual(['appSetting', 'documentDesign'])
    const invoice = JSON.parse(state.writes[0].data.value as string)
    const general = invoice.sections.find((s: { id: string }) => s.id === 'general')
    expect(general.fields).toEqual([{ id: 'cf_def-2', visible: true }])
    // The section keeps the on/off the workshop gave it.
    expect(general.visible).toBe(true)

    const design = state.writes[1].data.layout as ReturnType<typeof layout>
    expect(JSON.stringify(design)).not.toContain('cf_def-1')
    expect(design.sections.find((s) => s.id === 'general')?.visible).toBe(false)
  })

  it('changes no layout for a field of another workshop', async () => {
    state.settings = [
      { id: 's-1', key: 'invoice.layoutConfig', value: JSON.stringify(layout(true)) },
    ]
    expect((await deleteFieldDefinition('def-other')).success).toBe(false)
    expect(state.writes).toEqual([])
  })
})

describe('a layout without one field', () => {
  it('is null when the field was nowhere in it', () => {
    expect(layoutWithoutField(layout(true), 'def-9')).toBeNull()
    expect(layoutWithoutField(null, 'def-1')).toBeNull()
    expect(layoutWithoutField({ sections: 'broken' }, 'def-1')).toBeNull()
  })

  it('keeps everything else as it was stored', () => {
    const stored = layout(true, [{ id: 'cf_def-1', visible: false }])
    const next = layoutWithoutField(stored, 'def-1') as ReturnType<typeof layout>
    expect(next.version).toBe(2)
    expect(next.sections.map((s) => s.visible)).toEqual([true, true, true])
    expect(next.sections[1].fields).toEqual([{ id: 'customer_name', visible: true }])
  })
})
