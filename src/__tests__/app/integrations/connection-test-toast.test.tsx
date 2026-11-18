/**
 * The Test connection button on a connector's page. The action answers
 * `success: true` whenever the check ran, with what the check found in
 * `data.ok`, so a key without credit used to be told "Connection works" in
 * green. The toast now follows what the check found.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionSettings } from '@/app/(authenticated)/settings/integrations/[connector]/connection-settings'
import type { ConnectionView } from '@/features/integrations/Actions/integrationActions'
import { testIntegration } from '@/features/integrations/Actions/integrationActions'
import type { ActivityPage } from '@/features/integrations/Lib/types'
import { manifest } from '@/integrations/openai/manifest'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/components/upgrade-gate', () => ({ handleGated: () => false }))
vi.mock('@/features/integrations/Actions/integrationActions', () => ({
  backfillIntegrationAccounting: vi.fn(),
  backfillIntegrationCalendar: vi.fn(),
  disconnectIntegration: vi.fn(),
  // The model list on OpenAI's settings asks the vendor as the page opens.
  getIntegrationRemoteOptions: vi.fn(async () => ({ success: true, data: [] })),
  previewIntegrationRemoteOptions: vi.fn(),
  previewIntegrationTest: vi.fn(),
  retryIntegrationBatch: vi.fn(),
  retryIntegrationJob: vi.fn(),
  runIntegrationJob: vi.fn(),
  saveIntegrationCredentials: vi.fn(),
  sendIntegrationTestMessage: vi.fn(),
  testIntegration: vi.fn(),
  updateIntegrationSettings: vi.fn(),
}))
vi.mock('@/features/integrations/Hooks/useIntegrationActivity', () => ({
  useIntegrationActivity: (_org: string, _id: string, activity: ActivityPage) => ({
    data: { pages: [activity] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
  }),
}))

const view: ConnectionView = {
  manifest,
  connection: {
    id: 'conn-1',
    status: 'active',
    externalAccountName: null,
    externalAccountId: null,
    settings: {},
    lastHealthAt: null,
    lastSyncAt: null,
    lastError: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    tenantClientId: null,
  },
  platformApp: false,
  enabled: true,
  isCloud: false,
  webhookUrl: null,
  inspectionSync: null,
  backup: null,
  inbound: null,
  awaitingKeys: [],
  supersedes: null,
  redirectUri: 'http://localhost:3000/api/integrations/openai/callback',
}

const activity: ActivityPage = { items: [], logs: [], nextCursor: null }

async function pressTest(answer: Awaited<ReturnType<typeof testIntegration>>) {
  vi.mocked(testIntegration).mockResolvedValue(answer)
  render(<ConnectionSettings organizationId="org-1" view={view} activity={activity} />)
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  await waitFor(() => expect(testIntegration).toHaveBeenCalledWith('openai'))
  // The button comes back once the test has finished.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled())
}

describe('Test connection on a connected OpenAI page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows why a failed test failed, and never says the connection works', async () => {
    const message = 'This OpenAI account has no credit left. Add billing at platform.openai.com.'
    await pressTest({ success: true, data: { ok: false, message } })

    expect(toast.error).toHaveBeenCalledWith(message)
    expect(toast.success).not.toHaveBeenCalledWith('Connection works')
  })

  it('says the test failed when the check gives no reason', async () => {
    await pressTest({ success: true, data: { ok: false } })

    expect(toast.error).toHaveBeenCalledWith('The test failed')
    expect(toast.success).not.toHaveBeenCalledWith('Connection works')
  })

  it('says the connection works when the check passed', async () => {
    await pressTest({ success: true, data: { ok: true } })

    expect(toast.success).toHaveBeenCalledWith('Connection works')
    expect(toast.error).not.toHaveBeenCalled()
  })
})
