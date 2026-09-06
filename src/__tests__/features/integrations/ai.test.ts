import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_KEYS } from '@/features/ai/Schema/aiSettingsSchema'

const appSetting = { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() }
const integrationConnection = {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: { appSetting, integrationConnection } }))

const { AI_ADOPTED_KEY, aiSetup, isAiConfigured } = await import('@/features/integrations/Lib/ai')
const { openCredentials, sealCredentials } = await import('@/features/integrations/Lib/vault')

const ORG = 'org-1'

/** The four rows a workshop had before AI moved into the catalog. */
function legacyRows(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    [AI_KEYS.AI_ENABLED]: 'true',
    [AI_KEYS.AI_PROVIDER]: 'openai',
    [AI_KEYS.AI_API_KEY]: 'sk-old-key',
    [AI_KEYS.AI_MODEL]: 'gpt-4.1-mini',
    ...overrides,
  }
  return Object.entries(values)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => ({ key, value, userId: 'user-1' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'a'.repeat(64)
  integrationConnection.findMany.mockResolvedValue([])
  integrationConnection.findUnique.mockResolvedValue(null)
  appSetting.findMany.mockResolvedValue([])
  integrationConnection.create.mockImplementation(async ({ data }) => ({
    id: 'conn-new',
    status: data.status,
  }))
})

/**
 * The move is only safe if a workshop that pasted a key months ago keeps
 * generating descriptions without touching anything, so that is what these
 * check.
 */
describe('AI connection', () => {
  it('runs on an active connection, with the key from the vault', async () => {
    integrationConnection.findMany.mockResolvedValue([
      {
        id: 'conn-1',
        connectorId: 'anthropic',
        credentials: sealCredentials({ apiKey: 'sk-ant-new' }),
        settings: { model: 'claude-sonnet-4-6' },
      },
    ])

    await expect(aiSetup(ORG)).resolves.toEqual({
      connectionId: 'conn-1',
      provider: 'anthropic',
      apiKey: 'sk-ant-new',
      model: 'claude-sonnet-4-6',
    })
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })

  it('adopts an old settings-page setup on first use, sealing the key', async () => {
    appSetting.findMany.mockResolvedValue(legacyRows())

    const setup = await aiSetup(ORG)

    expect(setup).toMatchObject({ provider: 'openai', apiKey: 'sk-old-key', model: 'gpt-4.1-mini' })
    const created = integrationConnection.create.mock.calls[0][0].data
    expect(created).toMatchObject({
      organizationId: ORG,
      connectorId: 'openai',
      status: 'active',
      settings: { model: 'gpt-4.1-mini' },
    })
    // Sealed, not stored as it was typed.
    expect(created.credentials).not.toContain('sk-old-key')
    expect(openCredentials(created.credentials)).toEqual({ apiKey: 'sk-old-key' })
    // And recorded, so the next call does not adopt all over again.
    expect(appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_key: { organizationId: ORG, key: AI_ADOPTED_KEY } },
      })
    )
  })

  it('leaves a half-finished old setup alone', async () => {
    appSetting.findMany.mockResolvedValue(legacyRows({ [AI_KEYS.AI_API_KEY]: '' }))

    await expect(aiSetup(ORG)).resolves.toBeNull()
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })

  it('does not adopt a setup that was switched off', async () => {
    appSetting.findMany.mockResolvedValue(legacyRows({ [AI_KEYS.AI_ENABLED]: 'false' }))

    await expect(aiSetup(ORG)).resolves.toBeNull()
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })

  it('adopts once: a disconnected connection is not resurrected by the old rows', async () => {
    appSetting.findMany.mockResolvedValue([
      ...legacyRows(),
      { key: AI_ADOPTED_KEY, value: '2026-09-04T00:00:00.000Z', userId: 'user-1' },
    ])

    await expect(aiSetup(ORG)).resolves.toBeNull()
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })

  it('never writes over a connection the workshop made themselves', async () => {
    appSetting.findMany.mockResolvedValue(legacyRows())
    integrationConnection.findUnique.mockResolvedValue({ id: 'conn-theirs' })

    await expect(aiSetup(ORG)).resolves.toBeNull()
    expect(integrationConnection.create).not.toHaveBeenCalled()
    expect(appSetting.upsert).not.toHaveBeenCalled()
  })

  it('stands the other vendor down when an old setup goes live', async () => {
    appSetting.findMany.mockResolvedValue(legacyRows({ [AI_KEYS.AI_PROVIDER]: 'anthropic' }))

    await aiSetup(ORG)

    expect(integrationConnection.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, connectorId: { in: ['openai'] }, status: 'active' },
      data: { status: 'disconnected', lastError: null },
    })
  })

  it('falls back to the old rows when the vault cannot open a connection', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {
      // The fallback logs on purpose; the test only checks that it does.
    })
    integrationConnection.findMany.mockResolvedValue([
      { id: 'conn-1', connectorId: 'openai', credentials: 'v1.bad.bad.bad', settings: {} },
    ])
    appSetting.findMany.mockResolvedValue(legacyRows())

    await expect(aiSetup(ORG)).resolves.toMatchObject({ apiKey: 'sk-old-key' })
    expect(quiet).toHaveBeenCalled()
    quiet.mockRestore()
  })

  it('answers the "can we scan?" question without connecting anything', async () => {
    appSetting.findMany.mockResolvedValue(legacyRows())

    await expect(isAiConfigured(ORG)).resolves.toBe(true)
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })
})

/**
 * AI used to live on a settings page that the free plan could open, and the
 * integrations catalog is not on that plan. Moving the page must not take the
 * feature away, so a connector that names its own plan feature is gated by
 * that feature rather than by the catalog's.
 */
describe('plan gates', () => {
  it('lets a plan with AI but no integrations reach the AI connectors only', async () => {
    const { anyConnectorAllowed, connectorAllowed } = await import(
      '@/features/integrations/Lib/plan'
    )
    const { PLAN_FEATURES } = await import('@/lib/features')
    const { getManifest, listManifests } = await import('@/integrations/registry')

    const free = PLAN_FEATURES.free
    expect(free.integrations).toBe(false)
    expect(free.ai).toBe(true)

    expect(anyConnectorAllowed(free)).toBe(true)
    const reachable = listManifests()
      .filter((m) => connectorAllowed(m, free))
      .map((m) => m.id)
      .sort()
    expect(reachable).toEqual(['anthropic', 'openai'])

    const pro = PLAN_FEATURES.pro
    expect(connectorAllowed(getManifest('openai')!, pro)).toBe(true)
    expect(connectorAllowed(getManifest('zoom')!, pro)).toBe(true)
    expect(connectorAllowed(getManifest('zoom')!, free)).toBe(false)
  })
})
