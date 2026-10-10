/**
 * The designer's sheet before anything on it has been measured.
 *
 * Where a block goes depends on how tall the blocks above it are, and only a
 * browser can say. The server cannot, so the page it sends used to carry every
 * row at the top margin, one over the other, and a reload showed that pile
 * until hydration measured the blocks and moved them. Now the server sends the
 * paper with the blocks held back, and they are let through in the same pass
 * that measures them.
 *
 * `render` only returns after that pass, so the state before it is read here
 * the way a browser gets it: from the server's markup, and then hydrated.
 */
import { act, cleanup, render } from '@testing-library/react'
import { Profiler } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpecCanvas } from '@/features/invoice-designer/Render/SpecCanvas'
import { BLOCK_GAP } from '@/features/invoice-designer/Render/layoutEngine'
import type { Block, DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'

const MARGIN = 40
const PAGE = { width: 595, height: 842 }

function specOf(blocks: Block[]): DocumentSpec {
  return {
    page: {
      ...PAGE,
      margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      background: '#ffffff',
      text: '#111827',
      muted: '#6b7280',
      accent: '#d97706',
      fontFamily: 'Helvetica',
      fontSize: 9,
    },
    blocks,
  }
}

/** A block whose content carries the block's id, as the generators build them. */
const block = (id: string, placement: Block['placement']): Block => ({
  id,
  label: id,
  placement,
  content: { kind: 'text', id, text: `${id} text` },
})

const flow = (id: string, order: number) => block(id, { mode: 'flow', order })

/** Three rows in the flow, one block placed by hand and a pinned footer. */
const DOCUMENT = specOf([
  flow('a', 0),
  flow('b', 1),
  flow('c', 2),
  block('stamp', { mode: 'anchored', anchor: { x: 380, y: 600, width: 160, page: 1 } }),
  block('footer', { mode: 'pinned', edge: 'bottom' }),
])
const BLOCK_IDS = DOCUMENT.blocks.map((b) => b.id)

const NONE: ReadonlySet<string> = new Set()
/** The canvas reports what the pointer did; nothing here is listening. */
const noop = () => undefined

const canvas = (spec: DocumentSpec, zoom = 1) => (
  <SpecCanvas
    spec={spec}
    selected={null}
    onSelect={noop}
    onAnchor={noop}
    onInsert={noop}
    onPair={noop}
    pairable={NONE}
    zoom={zoom}
    rulers={false}
  />
)

/** The block as drawn on the paper, not its copy in the off-screen measurer. */
const drawn = (root: ParentNode, id: string) =>
  root.querySelector<HTMLElement>(`[data-sheet] [data-node-id="${id}"]`)

/** The copies of a block that sit outside every sheet: the ones measured. */
const measuringCopies = (root: ParentNode, id: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(`[data-node-id="${id}"]`)).filter(
    (el) => !el.closest('[data-sheet]')
  )

const loadingLines = (root: ParentNode) => root.querySelector<HTMLElement>('[data-sheet-loading]')

const pageLabel = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('div')).find(
    (el) => el.children.length === 0 && /^Page \d+ of \d+$/.test(el.textContent ?? '')
  )

/** jsdom lays nothing out, so every height reads 0 unless a test says otherwise. */
const realOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
function measureEveryBlockAs(height: number) {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => height,
  })
}

let host: HTMLElement | undefined
let root: Root | undefined

/** What the server would send, put on the page the way a browser receives it. */
function serverPage(spec: DocumentSpec) {
  host = document.createElement('div')
  host.innerHTML = renderToString(canvas(spec))
  document.body.appendChild(host)
  return host
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
  cleanup()
  if (realOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realOffsetHeight)
  }
  vi.restoreAllMocks()
})

describe('the sheet the server sends', () => {
  it('is the paper at its real size, with nothing placed on it yet', () => {
    const page = serverPage(DOCUMENT)

    const sheets = page.querySelectorAll<HTMLElement>('[data-sheet]')
    expect(sheets).toHaveLength(1)
    expect(sheets[0]).toBeVisible()
    expect(sheets[0].style.width).toBe(`${PAGE.width}px`)
    expect(sheets[0].style.height).toBe(`${PAGE.height}px`)

    // Every block is in the markup, and none of them is shown: with no heights
    // the rows are a block gap apart, which is a pile and not a document.
    for (const id of BLOCK_IDS) {
      const shell = drawn(page, id)
      expect(shell, id).not.toBeNull()
      expect(shell, id).not.toBeVisible()
    }
    // One sheet is all that can be known before measuring, so the count that
    // would read "of 1" is held back with the blocks.
    expect(pageLabel(page)).not.toBeVisible()
  })

  it('shows that the document is on its way, and says so to a screen reader', () => {
    const page = serverPage(DOCUMENT)

    const lines = loadingLines(page)
    expect(lines).toBeVisible()
    expect(lines?.closest('[data-sheet]')).toBe(page.querySelector('[data-sheet="1"]'))
    // Inside the page margins, where the document will start.
    expect(lines?.style.top).toBe(`${MARGIN}px`)
    expect(lines?.style.left).toBe(`${MARGIN}px`)
    // Decorative, so the announcement is the canvas being busy.
    expect(lines?.getAttribute('aria-hidden')).toBe('true')
    expect(lines?.textContent).toBe('')
    expect(page.querySelector('[aria-busy="true"]')).toContainElement(lines)
  })

  it('still carries every block off-screen to be measured', () => {
    // The measuring copy is what the first layout is computed from, so holding
    // the blocks back must not take it out of the markup. It stays hidden the
    // way it was: anything looking for the visible copy of a block skips it.
    const page = serverPage(DOCUMENT)
    for (const id of BLOCK_IDS) {
      const copies = measuringCopies(page, id)
      expect(copies, id).toHaveLength(1)
      expect(copies[0], id).not.toBeVisible()
    }
  })
})

describe('hydrating that sheet', () => {
  it('lets the blocks through where the measurement puts them, on the same elements', async () => {
    const page = serverPage(DOCUMENT)
    const before = {
      sheet: page.querySelector('[data-sheet="1"]'),
      a: drawn(page, 'a'),
      footer: drawn(page, 'footer'),
    }
    const errors = vi.spyOn(console, 'error').mockImplementation(noop)
    const recovered = vi.fn()
    measureEveryBlockAs(60)

    await act(async () => {
      root = hydrateRoot(page, canvas(DOCUMENT), { onRecoverableError: recovered })
    })

    // The first client render matched the server, so nothing was thrown away.
    expect(recovered).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    expect(page.querySelector('[data-sheet="1"]')).toBe(before.sheet)
    expect(drawn(page, 'a')).toBe(before.a)
    expect(drawn(page, 'footer')).toBe(before.footer)

    for (const id of BLOCK_IDS) expect(drawn(page, id), id).toBeVisible()
    const tops = ['a', 'b', 'c'].map((id) => drawn(page, id)?.parentElement?.style.top)
    expect(tops).toEqual([
      `${MARGIN}px`,
      `${MARGIN + 60 + BLOCK_GAP}px`,
      `${MARGIN + (60 + BLOCK_GAP) * 2}px`,
    ])

    expect(loadingLines(page)).toBeNull()
    expect(page.querySelector('[aria-busy]')).toBeNull()
    expect(pageLabel(page)).toBeVisible()
  })

  it('never shows a block anywhere but its measured place on the way there', async () => {
    // Letting the blocks through one render before the heights arrive would
    // put the pile back on screen for a frame. So the page is read after
    // every commit: the second row is either held back or where it belongs.
    const page = serverPage(DOCUMENT)
    measureEveryBlockAs(60)
    const commits: { shown: boolean; top?: string }[] = []
    const record = () => {
      const b = drawn(page, 'b')
      commits.push({ shown: b?.style.visibility !== 'hidden', top: b?.parentElement?.style.top })
    }

    await act(async () => {
      root = hydrateRoot(
        page,
        <Profiler id="canvas" onRender={record}>
          {canvas(DOCUMENT)}
        </Profiler>
      )
    })

    const placed = `${MARGIN + 60 + BLOCK_GAP}px`
    expect(commits[0].shown).toBe(false)
    expect(commits.at(-1)).toEqual({ shown: true, top: placed })
    expect(commits.filter((commit) => commit.shown && commit.top !== placed)).toEqual([])
  })
})

describe('the sheet mounted in the browser', () => {
  it('shows the blocks straight away, with no loading state left behind', () => {
    measureEveryBlockAs(60)
    const { container } = render(canvas(DOCUMENT))

    for (const id of BLOCK_IDS) expect(drawn(container, id), id).toBeVisible()
    expect(drawn(container, 'b')?.parentElement?.style.top).toBe(`${MARGIN + 60 + BLOCK_GAP}px`)
    expect(loadingLines(container)).toBeNull()
    expect(container.querySelector('[aria-busy]')).toBeNull()
    expect(pageLabel(container)).toBeVisible()
  })

  it('does not wait for a height it may never get', () => {
    // jsdom measures every block as 0, and a real block can too: an image
    // that has not arrived, a section with nothing in it. Having measured is
    // what opens the sheet, not what the measurement came to.
    const { container } = render(canvas(DOCUMENT))

    for (const id of BLOCK_IDS) expect(drawn(container, id), id).toBeVisible()
    expect(loadingLines(container)).toBeNull()
    expect(container.querySelector('[aria-busy]')).toBeNull()
  })

  it('opens a document with every section switched off', () => {
    const { container } = render(canvas(specOf([])))

    expect(container.querySelector('[data-sheet="1"]')).toBeVisible()
    expect(loadingLines(container)).toBeNull()
    expect(container.querySelector('[aria-busy]')).toBeNull()
  })

  it('never goes back to loading while the document is edited', () => {
    const { container, rerender } = render(canvas(DOCUMENT))
    const a = drawn(container, 'a')

    const edits: [DocumentSpec, number][] = [
      // A section switched on, one switched off, the sheet zoomed.
      [specOf([...DOCUMENT.blocks, flow('d', 3)]), 1],
      [specOf(DOCUMENT.blocks.filter((b) => b.id !== 'b')), 1],
      [DOCUMENT, 1.5],
    ]
    for (const [spec, zoom] of edits) {
      rerender(canvas(spec, zoom))
      expect(loadingLines(container)).toBeNull()
      expect(container.querySelector('[aria-busy]')).toBeNull()
      // The same element, still shown: an edit moves a block, it does not
      // take it off the page and put it back.
      expect(drawn(container, 'a')).toBe(a)
      expect(a).toBeVisible()
    }
    expect(drawn(container, 'd')).toBeNull()
    expect(drawn(container, 'b')).toBeVisible()
  })
})
