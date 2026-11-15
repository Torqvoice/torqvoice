/**
 * The element every portal page is drawn inside: it names the theme and
 * carries the workshop's colour, which is all the stylesheet needs.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PortalScope, usePortalLook } from '@/features/portal/Components/PortalLookContext'
import { PortalRoot } from '@/features/portal/Components/PortalRoot'
import type { PortalLook } from '@/features/portal/Lib/theme'

const garage: PortalLook = {
  theme: 'garage',
  accent: '#FFD60A',
  onAccent: '#0C0D0E',
  coverUrl: null,
  logoUrl: null,
  messagesEnabled: false,
  showTires: true,
}

function WhatISee() {
  const look = usePortalLook()
  return (
    <p>
      {look.theme} / chat {look.messagesEnabled ? 'on' : 'off'}
    </p>
  )
}

describe('the portal root', () => {
  it('names the theme and sets the accent and the ink on it', () => {
    render(
      <PortalRoot look={garage}>
        <p>Page</p>
      </PortalRoot>
    )
    const root = screen.getByText('Page').parentElement as HTMLElement
    expect(root).toHaveClass('portal-root')
    expect(root).toHaveAttribute('data-portal-theme', 'garage')
    expect(root.style.getPropertyValue('--p-accent')).toBe('#FFD60A')
    expect(root.style.getPropertyValue('--p-on-accent')).toBe('#0C0D0E')
  })

  it('is daylight in orange when it is given no look', () => {
    render(
      <PortalRoot>
        <p>Page</p>
      </PortalRoot>
    )
    const root = screen.getByText('Page').parentElement as HTMLElement
    expect(root).toHaveAttribute('data-portal-theme', 'daylight')
    expect(root.style.getPropertyValue('--p-accent')).toBe('#C2410C')
    expect(root.style.getPropertyValue('--p-on-accent')).toBe('#FFFFFF')
  })

  it('hands the look to the client components inside it', () => {
    render(
      <PortalRoot look={garage}>
        <WhatISee />
      </PortalRoot>
    )
    expect(screen.getByText('garage / chat off')).toBeInTheDocument()
  })

  it('gives content drawn outside the page the same theme and colours', () => {
    render(
      <PortalRoot look={garage}>
        <PortalScope>
          <p>In a dialog</p>
        </PortalScope>
      </PortalRoot>
    )
    const scope = screen.getByText('In a dialog').parentElement as HTMLElement
    expect(scope).toHaveAttribute('data-portal-theme', 'garage')
    expect(scope.style.getPropertyValue('--p-accent')).toBe('#FFD60A')
    expect(scope.style.getPropertyValue('--p-on-accent')).toBe('#0C0D0E')
  })
})
