/**
 * A stand-in the workshop has not written yet is marked on the canvas, the way
 * a missing slogan is: dashed, tagged, and unmistakable against a real line.
 * The mark belongs to the editor alone. The same nodes are drawn for the sheet
 * a customer opens, and a mark printed there would dress a line that is not
 * really on the paper, so it is opt-in through the context the canvas provides
 * and nothing else does.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { PlaceholderNodes, RenderNode } from '@/features/invoice-designer/Render/renderHtml'
import type { Node } from '@/features/invoice-designer/Spec/documentSpec'

const panel: Node = {
  kind: 'stack',
  children: [
    {
      kind: 'stack',
      id: 'payment_terms',
      children: [{ kind: 'text', text: 'Due within 14 days' }],
    },
    { kind: 'stack', id: 'due_date', children: [{ kind: 'text', text: '28.08.2026' }] },
  ],
}

describe('a row standing in for something unwritten', () => {
  it('is marked on the canvas, and only that row', () => {
    const { container, getAllByText } = render(
      <PlaceholderNodes.Provider value={{ ids: new Set(['payment_terms']), label: 'Placeholder' }}>
        <RenderNode node={panel} />
      </PlaceholderNodes.Provider>
    )
    expect(getAllByText('Placeholder')).toHaveLength(1)
    const marked = container.querySelector('[data-node-id="payment_terms"]')?.parentElement
    expect(marked?.getAttribute('style')).toContain('dashed')
    const other = container.querySelector('[data-node-id="due_date"]')?.parentElement
    expect(other?.getAttribute('style') ?? '').not.toContain('dashed')
  })

  it('carries no mark where the context is not provided', () => {
    const { container } = render(<RenderNode node={panel} />)
    expect(container.textContent).not.toContain('Placeholder')
    expect(container.innerHTML).not.toContain('dashed')
  })
})
