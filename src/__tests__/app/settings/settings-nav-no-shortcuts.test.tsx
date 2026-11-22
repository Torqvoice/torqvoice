import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsNav } from '@/app/(authenticated)/settings/settings-nav'

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/company',
  useRouter: () => ({ push: vi.fn() }),
}))

// Somebody who switched single-key shortcuts off under Keyboard shortcuts.
vi.mock('@/features/shortcuts/Components/ShortcutsProvider', () => ({
  useShortcuts: () => ({ prefs: { enabled: true, singleKeys: false } }),
}))

describe('the settings search with single-key shortcuts switched off', () => {
  it('leaves the slash key alone and shows no hint of it', () => {
    render(<SettingsNav isCloud supportEnabled />)
    const box = screen.getByRole('combobox', { name: 'Search settings' })

    fireEvent.keyDown(document.body, { key: '/' })
    expect(box).not.toHaveFocus()
    expect(screen.queryByText('/')).not.toBeInTheDocument()
  })
})
