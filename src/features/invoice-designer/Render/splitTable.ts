import type { Block, Node } from '../Spec/documentSpec'

/**
 * A long table on the on-screen sheet, cut between its rows across pages the
 * way the PDF cuts it. Only a block that is a table, or a titled table (a
 * stack whose last child is the table: the parts, labour and equipment
 * lists), can be cut; anything else still moves whole.
 */

type TableNode = Extract<Node, { kind: 'table' }>

/** Where the block's table is: the block itself, or the last child of its stack. */
export function tableOf(content: Node): TableNode | null {
  if (content.kind === 'table') return content
  if (content.kind === 'stack') {
    const last = content.children[content.children.length - 1]
    if (last?.kind === 'table') return last
  }
  return null
}

/** What the layout needs to cut a block: heights measured at print width. */
export interface TableSplit {
  /** From the block's top to its first row: border, padding, title, column headings. */
  head: number
  /** The column headings alone, repeated at the top of each later page. */
  header: number
  /** Each row's height, its rule included. */
  rows: number[]
  /** Below the last row, to the block's bottom. */
  tail: number
}

/** One piece of a cut block: its rows, and whether it is the first. */
export interface TableSlice {
  from: number
  to: number
  first: boolean
}

/**
 * The block as one piece of it draws: the first piece keeps the title and
 * column headings, a later one is the table alone with its headings again.
 * Banding carries on where the last piece left off.
 */
export function sliceBlock(block: Block, slice: TableSlice): Block {
  const table = tableOf(block.content)
  if (!table) return block
  const bandStart = table.groupKey
    ? table.rows.slice(0, slice.from).filter((row) => !row[table.groupKey as string]).length
    : slice.from
  const piece: TableNode = {
    ...table,
    rows: table.rows.slice(slice.from, slice.to),
    bandStart,
  }
  if (!slice.first || block.content.kind === 'table') {
    return { ...block, content: piece }
  }
  const stack = block.content as Extract<Node, { kind: 'stack' }>
  return { ...block, content: { ...stack, children: [...stack.children.slice(0, -1), piece] } }
}

/**
 * The heights of a measured block's table, read from the rows the renderer
 * marks. Null when the block has no table or it has under two rows.
 */
export function measureTable(element: HTMLElement): TableSplit | null {
  const header = element.querySelector<HTMLElement>('[data-table-head]')
  const rows = Array.from(element.querySelectorAll<HTMLElement>('[data-table-row]'))
  if (!header || rows.length < 2) return null
  const box = element.getBoundingClientRect()
  // Measured where the sheet may be scaled: back to print points.
  const unit = element.offsetHeight > 0 ? box.height / element.offsetHeight : 1
  const at = (y: number) => (y - box.top) / (unit || 1)
  const tops = rows.map((row) => at(row.getBoundingClientRect().top))
  const lastBottom = at(rows[rows.length - 1].getBoundingClientRect().bottom)
  return {
    head: tops[0],
    header: header.getBoundingClientRect().height / (unit || 1),
    rows: tops.map((top, i) => (i + 1 < tops.length ? tops[i + 1] : lastBottom) - top),
    tail: Math.max(0, element.offsetHeight - lastBottom),
  }
}
