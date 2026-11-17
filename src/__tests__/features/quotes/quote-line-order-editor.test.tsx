/**
 * Lines on a quote move by their grip, as they do on the work order (issue
 * #619). The grip is a keyboard control too: focus it, pick the line up with
 * Space, move it with the arrows and drop it with Space.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuoteLaborEditor } from '@/features/quotes/Components/QuoteLaborEditor'
import { QuotePartsEditor } from '@/features/quotes/Components/QuotePartsEditor'
import type { QuoteLaborInput, QuotePartInput } from '@/features/quotes/Components/quote-page-types'

const t = (key: string) => key

const part = (name: string): QuotePartInput => ({
  name,
  partNumber: '',
  quantity: 1,
  unitCost: 0,
  markupPercent: 0,
  unitPrice: 100,
  total: 100,
  excluded: false,
})

const labor = (description: string): QuoteLaborInput => ({
  description,
  hours: 1,
  rate: 800,
  total: 800,
  pricingType: 'hourly',
  excluded: false,
})

function PartsHarness({ initial }: { initial: QuotePartInput[] }) {
  const [items, setItems] = useState(initial)
  return (
    <QuotePartsEditor
      partItems={items}
      currencyCode="NOK"
      partsSubtotal={0}
      onUpdate={vi.fn()}
      onDelete={(index) => setItems((prev) => prev.filter((_, j) => j !== index))}
      onMove={(from, to) => setItems((prev) => arrayMove(prev, from, to))}
      onAdd={vi.fn()}
      t={t}
    />
  )
}

function LaborHarness({ initial }: { initial: QuoteLaborInput[] }) {
  const [items, setItems] = useState(initial)
  return (
    <QuoteLaborEditor
      laborItems={items}
      currencyCode="NOK"
      cs="kr"
      laborSubtotal={0}
      onUpdate={vi.fn()}
      onDelete={(index) => setItems((prev) => prev.filter((_, j) => j !== index))}
      onMove={(from, to) => setItems((prev) => arrayMove(prev, from, to))}
      onAdd={vi.fn()}
      t={t}
    />
  )
}

/**
 * jsdom lays nothing out, and dnd-kit finds the line above or below by where
 * it is on screen. Each draggable line is given a 50px slot by its position.
 */
const realRect = HTMLElement.prototype.getBoundingClientRect
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const line = this.closest('[data-testid="sortable-line"]') ?? this
    const siblings = line.parentElement
      ? Array.from(line.parentElement.children).filter(
          (el) => el.getAttribute('data-testid') === 'sortable-line'
        )
      : []
    const top = Math.max(siblings.indexOf(line), 0) * 50
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 600,
      bottom: top + 40,
      width: 600,
      height: 40,
      toJSON: () => ({}),
    } as DOMRect
  }
})
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect
})

async function key(target: Element, code: string) {
  await act(async () => {
    fireEvent.keyDown(target, { code, key: code === 'Space' ? ' ' : code })
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Picks line `index` up by its grip, moves it with `arrow` and drops it. */
async function moveWithKeyboard(label: string, index: number, arrow: 'ArrowUp' | 'ArrowDown') {
  const grip = screen.getAllByRole('button', { name: label })[index]
  grip.focus()
  await key(grip, 'Space')
  await key(document.activeElement ?? grip, arrow)
  await key(document.activeElement ?? grip, 'Space')
}

const partNames = () =>
  (screen.getAllByPlaceholderText('parts.namePlaceholder') as HTMLTextAreaElement[]).map(
    (field) => field.value
  )

const laborDescriptions = () =>
  (screen.getAllByPlaceholderText('labor.descriptionPlaceholder') as HTMLTextAreaElement[]).map(
    (field) => field.value
  )

describe('reordering quote lines', () => {
  it('gives every part line a grip named for what it does', () => {
    render(<PartsHarness initial={[part('Oil filter'), part('Brake pads')]} />)
    expect(screen.getAllByRole('button', { name: 'parts.reorderRow' })).toHaveLength(2)
  })

  it('moves a part line up with the keyboard', async () => {
    render(
      <PartsHarness initial={[part('Oil filter'), part('Brake pads'), part('Wiper blades')]} />
    )
    await moveWithKeyboard('parts.reorderRow', 1, 'ArrowUp')
    expect(partNames()).toEqual(['Brake pads', 'Oil filter', 'Wiper blades'])
  })

  it('moves a labour line down with the keyboard', async () => {
    render(<LaborHarness initial={[labor('Diagnose'), labor('Replace pads')]} />)
    await moveWithKeyboard('labor.reorderRow', 0, 'ArrowDown')
    expect(laborDescriptions()).toEqual(['Replace pads', 'Diagnose'])
  })

  it('deletes the line that was clicked after lines have moved', async () => {
    render(
      <PartsHarness initial={[part('Oil filter'), part('Brake pads'), part('Wiper blades')]} />
    )
    await moveWithKeyboard('parts.reorderRow', 2, 'ArrowUp')
    expect(partNames()).toEqual(['Oil filter', 'Wiper blades', 'Brake pads'])
    fireEvent.click(screen.getAllByRole('button', { name: 'parts.deleteRow' })[1])
    expect(partNames()).toEqual(['Oil filter', 'Brake pads'])
  })

  // Every save puts the shop fee last, so the editor keeps it there rather
  // than show an order that a reload would undo.
  const shopFee: QuoteLaborInput = { ...labor('Shop fee'), pricingType: 'shopFee' }

  it('gives the shop fee no grip', () => {
    render(<LaborHarness initial={[labor('Diagnose'), labor('Replace pads'), shopFee]} />)
    expect(screen.getAllByRole('button', { name: 'labor.reorderRow' })).toHaveLength(2)
  })

  it('does not move a line below the shop fee', async () => {
    render(<LaborHarness initial={[labor('Diagnose'), labor('Replace pads'), shopFee]} />)
    await moveWithKeyboard('labor.reorderRow', 1, 'ArrowDown')
    expect(laborDescriptions()).toEqual(['Diagnose', 'Replace pads', 'Shop fee'])
    await moveWithKeyboard('labor.reorderRow', 1, 'ArrowUp')
    expect(laborDescriptions()).toEqual(['Replace pads', 'Diagnose', 'Shop fee'])
  })
})
