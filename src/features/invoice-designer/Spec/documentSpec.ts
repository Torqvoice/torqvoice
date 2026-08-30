/**
 * What a printed document is, as data.
 *
 * One description, built once, rendered twice: to react-pdf for the paper and
 * to HTML for the designer. Neither renderer knows what a customer block looks
 * like — that lives in the generators — so a property cannot reach one and miss
 * the other, which is the class of bug this replaces.
 *
 * Everything here is in points at 72dpi, the unit react-pdf lays out in, so a
 * number means the same thing on screen and on paper.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface TextStyle {
  color?: string
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  uppercase?: boolean
  letterSpacing?: number
  lineHeight?: number
}

export interface BoxStyle {
  background?: string
  borderColor?: string
  borderWidth?: number
  radius?: number
  padding?: number | { top: number; right: number; bottom: number; left: number }
}

/**
 * A node's position when it has been taken out of the flow.
 *
 * Coordinates are from the top-left of the sheet, so an anchor means the same
 * thing wherever the node came from. This is what "put it where I want" is:
 * the element keeps its identity and gains a position.
 */
export interface Anchor {
  x: number
  y: number
  width?: number
  /** 1-based. Anchored nodes belong to one sheet. */
  page?: number
}

export type Node =
  | {
      kind: 'stack'
      id?: string
      gap?: number
      style?: BoxStyle
      anchor?: Anchor
      children: Node[]
    }
  | {
      kind: 'row'
      id?: string
      gap?: number
      align?: 'start' | 'center' | 'end'
      justify?: 'start' | 'center' | 'end' | 'between'
      style?: BoxStyle
      anchor?: Anchor
      children: { node: Node; width?: number | 'flex' }[]
    }
  | { kind: 'text'; id?: string; text: string; style?: TextStyle; anchor?: Anchor }
  /** A fragment from the rich-text editor: notes are written in it. */
  | { kind: 'richtext'; id?: string; html: string; style?: TextStyle; anchor?: Anchor }
  | {
      kind: 'image'
      id?: string
      src: string
      maxWidth: number
      maxHeight: number
      align?: 'left' | 'center' | 'right'
      anchor?: Anchor
    }
  | {
      kind: 'table'
      id?: string
      columns: { key: string; label: string; width: number | 'flex'; align?: 'left' | 'right' }[]
      rows: Record<string, string>[]
      /** A second line under a cell, for a part number under its description. */
      subKey?: string
      /** Rows whose value here is truthy print struck through and dimmed. */
      strikeKey?: string
      /** Thickness of the rule under each row, in points. */
      ruleWidth?: number
      /**
       * What an unbanded row paints behind itself, normally the sheet color.
       * Every row being opaque lets rules overlap beneath both neighbours,
       * which is what keeps their visible thickness exact and seam-free.
       */
      rowBackground?: string
      style?: BoxStyle
      headerStyle?: TextStyle & BoxStyle
      rowPadding?: number
      stripe?: string
      anchor?: Anchor
    }
  | { kind: 'spacer'; id?: string; height: number }

/** How a block finds its place on the sheet. */
export type Placement =
  | { mode: 'flow'; order: number; column?: 'left' | 'right' }
  /** Out of the flow, at a fixed spot. */
  | { mode: 'anchored'; anchor: Anchor }
  /** Held against an edge of every sheet, the way a printed footer is. */
  | { mode: 'pinned'; edge: 'top' | 'bottom' }

export interface Block {
  /** The section this came from, and what the designer selects. */
  id: string
  label: string
  /**
   * True for a block the generator conjured rather than the layout listing
   * it, like the title strip borrowed under the header when the layout hides
   * the Document Title section. A synthetic block is glued to its neighbour:
   * nothing can be dropped between them, because there is no place in the
   * saved layout such a drop could mean.
   */
  synthetic?: boolean
  placement: Placement
  /**
   * Room the block keeps around itself in the flow, in points per edge.
   * Ignored when the block is anchored: a hand-placed block IS its position.
   */
  margin?: { top: number; right: number; bottom: number; left: number }
  style?: BoxStyle
  /**
   * Typeface, size and ink for everything in the block, set once so it is
   * inherited rather than repeated on each node. A section overriding the
   * document's font used to reach the lines it happened to be written onto and
   * miss the rest.
   */
  text?: TextStyle
  content: Node
}

export interface PageSpec {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  background?: string
  text: string
  muted: string
  accent: string
  fontFamily: string
  fontSize: number
}

/** The band and rail of a framed sheet: chrome the page owns, not a section. */
export interface FrameSpec {
  side: 'left' | 'right'
  railWidth: number
  bandHeight: number
  color: string
  borderColor?: string
  /** The width of the drop shadow the frame casts, in points. 0 draws none. */
  shadow: number
  /** Rounding where the rail meets the band, in points. 0 keeps the corner. */
  radius: number
}

export interface DocumentSpec {
  page: PageSpec
  frame?: FrameSpec
  blocks: Block[]
}

/**
 * A row of the flow: one block across the width, or the pair that share it.
 *
 * The pairing rule lives here so both renderers group identically. It is also
 * the unit a page break can fall between, because a two-column row is laid out
 * as one thing.
 */
export type FlowRow =
  | { type: 'single'; block: Block }
  | { type: 'pair'; left: Block[]; right: Block[] }

export function groupFlowBlocks(blocks: Block[]): FlowRow[] {
  const flow = blocks
    .filter((b) => b.placement.mode === 'flow')
    .sort((a, b) =>
      a.placement.mode === 'flow' && b.placement.mode === 'flow'
        ? a.placement.order - b.placement.order
        : 0
    )

  const rows: FlowRow[] = []
  let left: Block[] = []
  let right: Block[] = []

  const flush = () => {
    if (left.length || right.length) {
      rows.push({ type: 'pair', left, right })
      left = []
      right = []
    }
  }

  for (const block of flow) {
    const column = block.placement.mode === 'flow' ? block.placement.column : undefined
    if (column === 'left') left.push(block)
    else if (column === 'right') right.push(block)
    else {
      flush()
      rows.push({ type: 'single', block })
    }
  }
  flush()
  return rows
}

/** Walk every node in a block, so callers need no knowledge of the shapes. */
export function walk(node: Node, visit: (node: Node) => void): void {
  visit(node)
  if (node.kind === 'stack') for (const child of node.children) walk(child, visit)
  if (node.kind === 'row') for (const child of node.children) walk(child.node, visit)
}

/** Every node in a document that carries an id, keyed by it. */
export function indexNodes(spec: DocumentSpec): Map<string, Node> {
  const index = new Map<string, Node>()
  for (const block of spec.blocks) {
    walk(block.content, (node) => {
      if (node.id) index.set(node.id, node)
    })
  }
  return index
}
