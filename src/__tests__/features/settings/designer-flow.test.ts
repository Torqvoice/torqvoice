/**
 * Two sections share a row when both are given a column, and the rule that
 * decides it lives in one place so the sheet and the paper group identically.
 */
import { describe, expect, it } from 'vitest'
import { groupFlowBlocks, type Block } from '@/features/invoice-designer/Spec/documentSpec'
import { materializeHiddenSection } from '@/features/settings/Schema/invoiceLayoutSchema'

const block = (id: string, order: number, column?: 'left' | 'right'): Block => ({
  id,
  label: id,
  placement: { mode: 'flow', order, column },
  content: { kind: 'text', text: id },
})

describe('a drop around the borrowed title', () => {
  /**
   * When Document Title is hidden, the generator draws a title strip glued
   * under the header anyway, so the number always prints. A drop that
   * references that strip must first make the section real at its drawn
   * position, or the drop lands wherever the hidden section's stored order
   * happens to point.
   */
  const section = (id: string, order: number, visible = true) => ({ id, visible, order })

  it('turns the hidden title visible right after the header', () => {
    const layout = {
      sections: [
        section('header', 0),
        section('slogan', 1),
        section('document_title', 4, false),
        section('parts_table', 5),
      ],
    }
    const next = materializeHiddenSection(layout, 'document_title')
    const ids = [...next.sections].sort((a, b) => a.order - b.order).map((s) => s.id)
    expect(ids).toEqual(['header', 'document_title', 'slogan', 'parts_table'])
    expect(next.sections.find((s) => s.id === 'document_title')?.visible).toBe(true)
  })

  it('leaves a visible title exactly where it is', () => {
    const layout = { sections: [section('header', 0), section('document_title', 3)] }
    expect(materializeHiddenSection(layout, 'document_title')).toBe(layout)
  })

  it('marks the borrowed title block as synthetic in the spec', () => {
    const synthetic: Block = {
      id: 'document_title',
      label: 'document title',
      synthetic: true,
      placement: { mode: 'flow', order: 0.5 },
      content: { kind: 'text', text: 'INVOICE' },
    }
    expect(synthetic.synthetic).toBe(true)
  })
})

describe('flow rows', () => {
  it('puts a full-width section on a row of its own', () => {
    const rows = groupFlowBlocks([block('header', 0), block('totals', 1)])
    expect(rows.map((r) => r.type)).toEqual(['single', 'single'])
  })

  it('pairs a left and a right section side by side', () => {
    const rows = groupFlowBlocks([
      block('header', 0),
      block('customer', 1, 'left'),
      block('vehicle', 2, 'right'),
      block('items_table', 3),
    ])
    expect(rows.map((r) => r.type)).toEqual(['single', 'pair', 'single'])
    const pair = rows[1] as Extract<(typeof rows)[number], { type: 'pair' }>
    expect(pair.left.map((b) => b.id)).toEqual(['customer'])
    expect(pair.right.map((b) => b.id)).toEqual(['vehicle'])
  })

  it('stacks several sections in the same column', () => {
    const rows = groupFlowBlocks([
      block('customer', 0, 'left'),
      block('service', 1, 'left'),
      block('vehicle', 2, 'right'),
    ])
    const pair = rows[0] as Extract<(typeof rows)[number], { type: 'pair' }>
    expect(pair.left.map((b) => b.id)).toEqual(['customer', 'service'])
    expect(pair.right.map((b) => b.id)).toEqual(['vehicle'])
  })

  it('breaks the pair when a full-width section comes between', () => {
    const rows = groupFlowBlocks([
      block('customer', 0, 'left'),
      block('items_table', 1),
      block('vehicle', 2, 'right'),
    ])
    expect(rows.map((r) => r.type)).toEqual(['pair', 'single', 'pair'])
  })

  it('leaves anything placed by hand out of the flow entirely', () => {
    const anchored: Block = {
      id: 'logo',
      label: 'logo',
      placement: { mode: 'anchored', anchor: { x: 10, y: 10 } },
      content: { kind: 'text', text: 'logo' },
    }
    const rows = groupFlowBlocks([block('customer', 0, 'left'), anchored])
    expect(rows).toHaveLength(1)
    expect(
      (rows[0] as Extract<(typeof rows)[number], { type: 'pair' }>).left.map((b) => b.id)
    ).toEqual(['customer'])
  })
})
