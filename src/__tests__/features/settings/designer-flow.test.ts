/**
 * Two sections share a row when both are given a column, and the rule that
 * decides it lives in one place so the sheet and the paper group identically.
 */
import { describe, expect, it } from 'vitest'
import { groupFlowBlocks, type Block } from '@/features/invoice-designer/Spec/documentSpec'

const block = (id: string, order: number, column?: 'left' | 'right'): Block => ({
  id,
  label: id,
  placement: { mode: 'flow', order, column },
  content: { kind: 'text', text: id },
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
