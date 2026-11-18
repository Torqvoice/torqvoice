/**
 * Backups by Torqvoice on a plan without them. The card used to be one line
 * of text, so a workshop deciding whether to pay could not see what it would
 * get. It now shows an example of the real card, labelled as one so nobody
 * takes it for their own backups, with the way to the plans in its header.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlatformBackupsCard } from '@/features/integrations/Components/PlatformBackupsCard'
import type { PlatformBackupOverview } from '@/features/integrations/Lib/backup-types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/features/integrations/Actions/getPlatformBackupStatus', () => ({
  getPlatformBackupStatus: vi.fn(),
}))
vi.mock('@/features/integrations/Actions/runPlatformBackupNow', () => ({
  runPlatformBackupNow: vi.fn(),
}))
vi.mock('@/features/integrations/Components/PlatformRestoreDialog', () => ({
  PlatformRestoreDialog: () => null,
}))
vi.mock('@/features/integrations/Hooks/useBackupSnapshots', () => ({
  useActionErrorText: () => (error?: string) => error ?? '',
}))

const NOW = new Date(Date.UTC(2026, 10, 7, 12, 0))

const locked: PlatformBackupOverview = {
  active: false,
  paused: false,
  purgeDueAt: null,
  lastGoodAt: null,
  nextRunAt: null,
  repositorySize: null,
  snapshots: [],
  recent: [],
  running: false,
  restoring: false,
  queuedAhead: 0,
  canRestore: true,
  workshopName: 'Test workshop',
}

function renderCard(overview: PlatformBackupOverview = locked) {
  return render(<PlatformBackupsCard overview={overview} reauth="none" now={NOW} />)
}

describe('Backups by Torqvoice without a plan that includes them', () => {
  it('says what Pro adds and links to the plans', () => {
    renderCard()

    expect(screen.getByText('PRO')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /See plans/ })).toHaveAttribute(
      'href',
      '/settings/subscription'
    )
    expect(
      screen.getByText(
        'Available on Pro: hourly backups run by Torqvoice with restore points you can go back to.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back up now/ })).not.toBeInTheDocument()
  })

  it('shows an example of the card, labelled as one', () => {
    renderCard()

    expect(screen.getByText('Example')).toBeInTheDocument()
    const example = screen.getByTestId('platform-backups-example')
    expect(within(example).getByText('32 minutes ago')).toBeInTheDocument()
    expect(within(example).getByText('191.4 MB')).toBeInTheDocument()
    expect(within(example).getAllByText('101.2 MB').length).toBeGreaterThan(1)
    expect(within(example).getByText('Latest')).toBeInTheDocument()
  })

  it('keeps the example out of reach: nothing in it can be used or read aloud', () => {
    renderCard()

    const example = screen.getByTestId('platform-backups-example')
    expect(example).toHaveAttribute('aria-hidden', 'true')
    expect(example).toHaveAttribute('inert')
    // Made-up restore points have no page to open.
    expect(within(example).queryAllByRole('link', { hidden: true })).toHaveLength(0)
  })

  it('says until when the kept restore points stay once the plan has lapsed', () => {
    renderCard({ ...locked, paused: true, purgeDueAt: '2026-12-07T12:00:00.000Z' })

    expect(
      screen.getByText(/the restore points are kept until December 7, 2026/)
    ).toBeInTheDocument()
    expect(screen.getByText('Example')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /See plans/ })).toBeInTheDocument()
  })
})
