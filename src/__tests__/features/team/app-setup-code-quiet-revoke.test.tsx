/**
 * Closing the setup code dialog revokes the code in the background. Nobody
 * asked for that, and the code expires on its own, so a revoke that cannot
 * reach the server must not be left unhandled: an unhandled network failure
 * right after a click is what raises the "Couldn't reach Torqvoice" notice,
 * which would then claim the person's own change was lost.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Who was asked to revoke; the answer itself comes from the action below. */
const revokeAppSetupCode = vi.fn()

vi.mock('@/features/team/Actions/createAppSetupCode', () => ({
  // Still on its way; the dialog is closed before the code arrives.
  createAppSetupCode: () => new Promise(() => undefined),
  // A promise of its own, not one a mock returns: a mock watches its own
  // promises to record how they settled, and that would count as handling
  // the failure.
  revokeAppSetupCode: async (input: unknown) => {
    revokeAppSetupCode(input)
    throw new TypeError('Failed to fetch')
  },
}))
vi.mock('@/features/team/hooks/useTechnicianConnected', () => ({
  useTechnicianConnected: vi.fn(),
}))
// The code and its QR; not what this is about.
vi.mock('@/features/team/Components/SetupCodeHandoff', () => ({ SetupCodeHandoff: () => null }))

import { AppSetupCodeDialog } from '@/features/team/Components/AppSetupCodeDialog'

describe('closing the setup code dialog on a dropped connection', () => {
  const unhandled = vi.fn()

  beforeEach(() => {
    unhandled.mockClear()
    revokeAppSetupCode.mockClear()
    process.on('unhandledRejection', unhandled)
  })

  afterEach(() => {
    process.off('unhandledRejection', unhandled)
  })

  it('closes, and leaves nothing behind to raise the lost-connection notice', async () => {
    const onClose = vi.fn()
    render(
      <AppSetupCodeDialog
        userId="u2"
        memberName="Kari Mekaniker"
        workshopUrl="https://app.example.com"
        onClose={onClose}
      />
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      // Long enough for an unhandled rejection to be reported.
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(revokeAppSetupCode).toHaveBeenCalledWith({ userId: 'u2' })
    expect(onClose).toHaveBeenCalled()
    expect(unhandled).not.toHaveBeenCalled()
  })
})
