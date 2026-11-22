import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsNav } from '@/app/(authenticated)/settings/settings-nav'

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/company',
  useRouter: () => ({ push: vi.fn() }),
}))

/**
 * The settings menu beside the content: one line per page, a search box that
 * a bare slash reaches, and results that take the menu's place.
 */
describe('the compact settings menu', () => {
  it('lists each page by its name alone and keeps the description as a tip', () => {
    render(<SettingsNav isCloud supportEnabled />)

    const company = screen.getByRole('link', { name: 'Company' })
    expect(company).toHaveAttribute('title', 'Business details & branding')
    expect(screen.queryByText('Business details & branding')).not.toBeInTheDocument()
  })

  it('shows what is found in place of the menu, and the menu again when cleared', () => {
    render(<SettingsNav isCloud supportEnabled />)
    const box = screen.getByRole('combobox', { name: 'Search settings' })

    fireEvent.change(box, { target: { value: 'company' } })
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByText(/results? · ↑↓ to move · Esc to clear/)).toBeInTheDocument()

    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('puts the cursor in the search box on a bare slash', () => {
    render(<SettingsNav isCloud supportEnabled />)
    const box = screen.getByRole('combobox', { name: 'Search settings' })

    fireEvent.keyDown(document.body, { key: '/' })
    expect(box).toHaveFocus()
  })

  it('leaves a slash typed into a field alone', () => {
    render(
      <>
        <input aria-label="Workshop name" />
        <SettingsNav isCloud supportEnabled />
      </>
    )
    const field = screen.getByRole('textbox', { name: 'Workshop name' })
    field.focus()

    const typed = fireEvent.keyDown(field, { key: '/' })
    expect(typed).toBe(true)
    expect(field).toHaveFocus()
  })

  it('keeps the menu under the results on a narrow window, with no slash key', () => {
    render(<SettingsNav isCloud supportEnabled mobile />)
    const box = screen.getByRole('combobox', { name: 'Search settings' })

    fireEvent.keyDown(document.body, { key: '/' })
    expect(box).not.toHaveFocus()

    fireEvent.change(box, { target: { value: 'company' } })
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
    expect(screen.queryByText(/to move · Esc to clear/)).not.toBeInTheDocument()
  })
})
