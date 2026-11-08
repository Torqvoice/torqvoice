import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ServiceHeaderActions } from '@/features/vehicles/Components/service-page/ServiceHeaderActions'

/**
 * The work order's save state sits on the Save button, not in a text label
 * beside it, so the row of buttons is the same width whatever the state: the
 * label used to push the buttons onto a second line on every edit. The words
 * still reach a screen reader.
 */

const noop = vi.fn()
const header = (state: { hasUnsavedChanges?: boolean; showSaved?: boolean }) => (
  <TooltipProvider>
    <ServiceHeaderActions
      showSave
      downloading={false}
      saving={false}
      onDownloadPDF={noop}
      onPreviewPDF={noop}
      onDelete={noop}
      onShowEmail={noop}
      onShowShare={noop}
      {...state}
    />
  </TooltipProvider>
)

describe('the work order save state', () => {
  it('says "Unsaved changes" without a label that widens the row', () => {
    render(header({ hasUnsavedChanges: true }))
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
    expect(screen.getByRole('status')).toHaveClass('sr-only')
    // The button keeps its name, so everything that finds it by name still does.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('says "Saved" after a save, and nothing once it settles', () => {
    const { rerender } = render(header({ showSaved: true }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    rerender(header({}))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
