/**
 * Custom field default values and invoice placement.
 *
 * Covers the defaultValue validation rules, the definitions-first print
 * fallback (no stored row -> default, stored '' -> stays empty), and the
 * setCustomFieldPlacement action's layout-config rewriting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    customFieldDefinition: { findFirst: vi.fn(), findMany: vi.fn() },
    customFieldValue: { findMany: vi.fn() },
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  createFieldDefinitionSchema,
  updateFieldDefinitionSchema,
} from '@/features/custom-fields/Schema/customFieldSchema'
import { getCustomFieldsForPrint } from '@/features/custom-fields/Lib/getCustomFieldsForPrint'
import { setCustomFieldPlacement } from '@/features/settings/Actions/invoiceLayoutActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

const ORG = 'org-1'

function setupOwner() {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'owner@example.com' },
  } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  setupOwner()
})

const baseField = {
  name: 'bank_name',
  label: 'Bank name',
  fieldType: 'text',
  entityType: 'service_record',
} as const

describe('defaultValue validation', () => {
  it('accepts a plain text default', () => {
    const parsed = createFieldDefinitionSchema.parse({ ...baseField, defaultValue: 'My Bank' })
    expect(parsed.defaultValue).toBe('My Bank')
  })

  it('rejects a select default that is not one of the options', () => {
    const result = createFieldDefinitionSchema.safeParse({
      ...baseField,
      fieldType: 'select',
      options: 'A, B, C',
      defaultValue: 'D',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a select default from the options list', () => {
    const result = createFieldDefinitionSchema.safeParse({
      ...baseField,
      fieldType: 'select',
      options: 'A, B, C',
      defaultValue: 'B',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a checkbox default that is not true/false', () => {
    const result = createFieldDefinitionSchema.safeParse({
      ...baseField,
      fieldType: 'checkbox',
      defaultValue: 'yes',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-numeric number default', () => {
    const result = createFieldDefinitionSchema.safeParse({
      ...baseField,
      fieldType: 'number',
      defaultValue: 'abc',
    })
    expect(result.success).toBe(false)
  })

  it('enforces the same rules on update (extend must not drop the refinement)', () => {
    const result = updateFieldDefinitionSchema.safeParse({
      id: 'def-1',
      ...baseField,
      fieldType: 'checkbox',
      defaultValue: 'yes',
    })
    expect(result.success).toBe(false)
  })
})

describe('getCustomFieldsForPrint', () => {
  const definitions = [
    { id: 'f1', label: 'Bank name', fieldType: 'text', defaultValue: 'My Bank' },
    { id: 'f2', label: 'Reference', fieldType: 'text', defaultValue: null },
    { id: 'f3', label: 'Cleared', fieldType: 'text', defaultValue: 'fallback' },
  ]

  it('falls back to the default when no value row exists, keeps a cleared value empty', async () => {
    vi.mocked(db.customFieldDefinition.findMany).mockResolvedValue(definitions as any)
    vi.mocked(db.customFieldValue.findMany).mockResolvedValue([
      { fieldId: 'f2', value: 'entered' },
      { fieldId: 'f3', value: '' }, // user cleared it: the default must not resurrect
    ] as any)

    const fields = await getCustomFieldsForPrint(ORG, 'rec-1', 'service_record')

    expect(fields).toEqual([
      { fieldId: 'f1', label: 'Bank name', fieldType: 'text', value: 'My Bank' },
      { fieldId: 'f2', label: 'Reference', fieldType: 'text', value: 'entered' },
    ])
  })

  it('returns nothing when there are no definitions', async () => {
    vi.mocked(db.customFieldDefinition.findMany).mockResolvedValue([] as any)
    const fields = await getCustomFieldsForPrint(ORG, 'rec-1', 'service_record')
    expect(fields).toEqual([])
    expect(db.customFieldValue.findMany).not.toHaveBeenCalled()
  })
})

describe('setCustomFieldPlacement', () => {
  const DEF_ID = 'def-1'
  const CF_ID = `cf_${DEF_ID}`

  function setupClassicLayout(sections?: unknown[]) {
    vi.mocked(db.customFieldDefinition.findFirst).mockResolvedValue({
      id: DEF_ID,
      organizationId: ORG,
      entityType: 'service_record',
    } as any)
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(
      sections === undefined ? (null as any) : ({ value: JSON.stringify({ sections }) } as any)
    )
    vi.mocked(db.appSetting.upsert).mockResolvedValue({} as any)
  }

  function savedConfig() {
    const call = vi.mocked(db.appSetting.upsert).mock.calls[0][0] as any
    return JSON.parse(call.update.value)
  }

  it('places the field in the requested section and removes it everywhere else', async () => {
    setupClassicLayout([
      { id: 'header', visible: true, order: 0, fields: [] },
      { id: 'bank_account', visible: true, order: 1, fields: [] },
      { id: 'general', visible: false, order: 2, fields: [{ id: CF_ID, visible: true }] },
    ])

    const result = await setCustomFieldPlacement({
      definitionId: DEF_ID,
      entityType: 'service_record',
      placement: 'bank_account',
    })

    expect(result.success).toBe(true)
    const config = savedConfig()
    const bank = config.sections.find((s: any) => s.id === 'bank_account')
    const general = config.sections.find((s: any) => s.id === 'general')
    expect(bank.fields.some((f: any) => f.id === CF_ID && f.visible)).toBe(true)
    expect(general.fields.some((f: any) => f.id === CF_ID)).toBe(false)
  })

  it('stores "hidden" as an invisible entry in general', async () => {
    setupClassicLayout([
      { id: 'footer', visible: true, order: 0, fields: [{ id: CF_ID, visible: true }] },
    ])

    const result = await setCustomFieldPlacement({
      definitionId: DEF_ID,
      entityType: 'service_record',
      placement: 'hidden',
    })

    expect(result.success).toBe(true)
    const config = savedConfig()
    const general = config.sections.find((s: any) => s.id === 'general')
    const footer = config.sections.find((s: any) => s.id === 'footer')
    expect(general.fields).toContainEqual({ id: CF_ID, visible: false })
    expect(footer.fields.some((f: any) => f.id === CF_ID)).toBe(false)
    // Hiding a field must not switch the general panel on.
    expect(general.visible).toBe(false)
  })

  it('switches the general section visible when placing a field there', async () => {
    setupClassicLayout()

    const result = await setCustomFieldPlacement({
      definitionId: DEF_ID,
      entityType: 'service_record',
      placement: 'general',
    })

    expect(result.success).toBe(true)
    const config = savedConfig()
    const general = config.sections.find((s: any) => s.id === 'general')
    expect(general.visible).toBe(true)
    expect(general.fields).toContainEqual({ id: CF_ID, visible: true })
  })

  it('does not stamp a version onto a classic layout', async () => {
    setupClassicLayout([{ id: 'header', visible: true, order: 0, fields: [] }])

    await setCustomFieldPlacement({
      definitionId: DEF_ID,
      entityType: 'service_record',
      placement: 'header',
    })

    expect(savedConfig().version).toBeUndefined()
  })

  it('writes the quote layout for quote fields', async () => {
    vi.mocked(db.customFieldDefinition.findFirst).mockResolvedValue({
      id: DEF_ID,
      organizationId: ORG,
      entityType: 'quote',
    } as any)
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null as any)
    vi.mocked(db.appSetting.upsert).mockResolvedValue({} as any)

    await setCustomFieldPlacement({
      definitionId: DEF_ID,
      entityType: 'quote',
      placement: 'footer',
    })

    const call = vi.mocked(db.appSetting.upsert).mock.calls[0][0] as any
    expect(call.where.organizationId_key.key).toBe(SETTING_KEYS.QUOTE_LAYOUT_CONFIG)
  })

  it('rejects an unknown placement', async () => {
    setupClassicLayout()
    const result = await setCustomFieldPlacement({
      definitionId: DEF_ID,
      entityType: 'service_record',
      placement: 'totals',
    })
    expect(result.success).toBe(false)
  })
})
