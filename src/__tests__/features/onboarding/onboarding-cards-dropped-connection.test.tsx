/**
 * The getting-started card and the sample data card when an action does not
 * reach the server. An action that cannot reach the server throws instead of
 * answering. Hiding the checklist awaited it inside a transition, so the
 * throw went to the error boundary and the dashboard was replaced by the
 * error page; a refusal hid nothing and said nothing. Removing the sample
 * data left its button spinning until the page was reloaded.
 */
import { Component, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'

/** What a dropped connection does to a server action: it throws. */
const offline = async () => {
  throw new TypeError('Failed to fetch')
}

const dismissOnboardingChecklist = vi.fn(offline)
const removeSampleData = vi.fn(offline)
const router = { refresh: vi.fn(), push: vi.fn() }

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/onboarding/Actions/checklistActions', () => ({
  dismissOnboardingChecklist: () => dismissOnboardingChecklist(),
  removeSampleData: () => removeSampleData(),
}))

import { GettingStartedCard } from '@/features/onboarding/Components/GettingStartedCard'
import { SampleDataCard } from '@/features/onboarding/Components/SampleDataCard'

/** Stands in for the app's error page, so losing the page is visible. */
class ErrorPage extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>Something went wrong</p> : this.props.children
  }
}

const CHECKLIST = {
  steps: { workOrder: true, company: false, invoice: false },
  allDone: false,
  hasSampleData: true,
  workshopName: 'Berg Motor',
  invoiceHref: '/work-orders',
}

function renderChecklist() {
  render(
    <ErrorPage>
      <TooltipProvider>
        <ConfirmProvider>
          <GettingStartedCard data={CHECKLIST} />
        </ConfirmProvider>
      </TooltipProvider>
    </ErrorPage>
  )
}

/** Answers the question on screen with its destructive button. */
async function confirmRemove() {
  const question = await screen.findByRole('alertdialog')
  await act(async () => {
    fireEvent.click(within(question).getByRole('button', { name: 'Remove sample data' }))
  })
}

describe('getting-started card on a dropped connection', () => {
  beforeEach(() => {
    dismissOnboardingChecklist.mockReset()
    dismissOnboardingChecklist.mockImplementation(offline)
    removeSampleData.mockReset()
    removeSampleData.mockImplementation(offline)
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.success).mockClear()
    router.refresh.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('says hiding the checklist failed and keeps the dashboard', async () => {
    renderChecklist()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide this checklist' }))
    })

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't hide the checklist. Try again.")
    )
    expect(dismissOnboardingChecklist).toHaveBeenCalled()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.getByText('Getting started')).toBeInTheDocument()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('says so when the server refuses to hide the checklist', async () => {
    dismissOnboardingChecklist.mockImplementation(async () => {
      return { success: false, error: 'You do not have permission to do that' } as never
    })
    renderChecklist()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide this checklist' }))
    })

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('You do not have permission to do that')
    )
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('says removing the sample data failed and leaves its button usable', async () => {
    renderChecklist()

    fireEvent.click(screen.getByRole('button', { name: 'Remove sample data' }))
    await confirmRemove()

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not remove sample data'))
    expect(removeSampleData).toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove sample data' })).toBeEnabled()
  })
})

describe('sample data card on a dropped connection', () => {
  beforeEach(() => {
    removeSampleData.mockReset()
    removeSampleData.mockImplementation(offline)
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.success).mockClear()
    router.refresh.mockClear()
  })

  it('says removing the sample data failed and leaves the button usable', async () => {
    render(
      <ConfirmProvider>
        <SampleDataCard />
      </ConfirmProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove sample data' }))
    await confirmRemove()

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not remove sample data'))
    expect(toast.success).not.toHaveBeenCalled()
    expect(router.refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove sample data' })).toBeEnabled()
  })
})
