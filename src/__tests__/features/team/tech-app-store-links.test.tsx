import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: (props: { alt: string }) => <span>{props.alt}</span>,
}))

import { AppSetupLanding } from '@/app/(public)/app-setup/app-setup-landing'
import { SetupCodeHandoff } from '@/features/team/Components/SetupCodeHandoff'

/**
 * Torqvoice Tech is on Google Play and the App Store. Both places that send a
 * technician to install it offer both stores, so an iPhone is not sent to
 * Google Play.
 */

const PLAY = 'https://play.google.com/store/apps/details?id=com.torqvoice.technician'
const APPLE = 'https://apps.apple.com/app/id6809578893'

function storeLinks() {
  return {
    play: screen.getByRole('link', { name: 'Get it on Google Play' }),
    apple: screen.getByRole('link', { name: 'Download on the App Store' }),
  }
}

describe('installing the technician app', () => {
  it('offers both stores in the setup dialog at the desk', () => {
    render(
      <SetupCodeHandoff
        issued={{
          code: 'ABCD1234',
          display: 'ABCD-1234',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          name: 'Jake',
        }}
        error={null}
        workshopUrl="https://app.example.com"
        memberName="Jake"
      />
    )
    const { play, apple } = storeLinks()
    expect(play).toHaveAttribute('href', PLAY)
    expect(apple).toHaveAttribute('href', APPLE)
  })

  it('offers both stores on the page a scanned code opens', () => {
    render(<AppSetupLanding />)
    const { play, apple } = storeLinks()
    expect(play).toHaveAttribute('href', PLAY)
    expect(apple).toHaveAttribute('href', APPLE)
  })
})
