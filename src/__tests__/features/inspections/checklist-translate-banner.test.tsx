import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const translateChecklists = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/inspections/Actions/templateActions', () => ({
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  duplicateTemplate: vi.fn(),
  restoreMissingPresets: vi.fn(),
  createTemplateFromPreset: vi.fn(),
  translateChecklists: (...args: unknown[]) => translateChecklists(...args),
}))
vi.mock('@/features/inspections/Actions/packageActions', () => ({
  exportTemplatePackage: vi.fn(),
  importTemplatePackage: vi.fn(),
  previewTemplatePackage: vi.fn(),
}))

import { TemplateListClient } from '@/features/inspections/Components/TemplateListClient'

const TEMPLATE = {
  id: 't1',
  name: 'Norway — EU-kontroll',
  description: null,
  isDefault: true,
  packageId: 'torqvoice/no-eu-kontroll',
  sections: [],
}

describe('checklist translation offer', () => {
  beforeEach(() => translateChecklists.mockReset())

  it('offers to translate checklists written in another language than the viewer uses', async () => {
    translateChecklists.mockResolvedValue({ success: true, data: { locale: 'en' } })
    render(<TemplateListClient templates={[TEMPLATE]} checklistLanguage="nb" />)

    expect(screen.getByText(/ready-made checklists are in Norwegian/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    await waitFor(() => expect(translateChecklists).toHaveBeenCalledWith('en'))
  })

  it('says nothing when the checklists are already in the viewer language', () => {
    render(<TemplateListClient templates={[TEMPLATE]} checklistLanguage="en" />)
    expect(screen.queryByRole('button', { name: 'Translate' })).not.toBeInTheDocument()
  })

  it('says nothing when the workshop has no built-in checklists', () => {
    render(<TemplateListClient templates={[TEMPLATE]} checklistLanguage={null} />)
    expect(screen.queryByRole('button', { name: 'Translate' })).not.toBeInTheDocument()
  })
})
