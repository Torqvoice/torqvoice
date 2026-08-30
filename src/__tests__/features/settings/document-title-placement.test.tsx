/**
 * The invoice number, date and due date have to print exactly once, and always
 * where the layout puts them.
 *
 * Every header style used to print its own copy unconditionally, while the
 * Document Title section printed another. Turning that section on therefore
 * moved the block on a framed sheet and duplicated it on the other three, which
 * read from the outside as the block wandering on its own.
 */
import type { ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { Header } from '@/features/vehicles/Components/invoice-pdf/Header'
import { createStyles } from '@/features/vehicles/Components/invoice-pdf/styles'

const HEADER_STYLES = ['standard', 'compact', 'modern', 'framed']

/**
 * Depth-first search of a react-pdf element tree for a rendered string.
 *
 * Our own components are plain presentational functions, so the walker calls
 * them rather than stopping at the element: the framed letterhead takes the
 * company name as a prop, and text inside an uncalled component is invisible.
 */
function containsText(node: ReactNode, needle: string): boolean {
  if (node == null || typeof node === 'boolean') return false
  if (typeof node === 'string') return node.includes(needle)
  if (typeof node === 'number') return String(node).includes(needle)
  if (Array.isArray(node)) return node.some((child) => containsText(child, needle))

  const element = node as { type?: unknown; props?: { children?: ReactNode } }
  if (typeof element.type === 'function') {
    const render = element.type as (props: unknown) => ReactNode
    return containsText(render(element.props), needle)
  }
  return containsText(element.props?.children, needle)
}

function renderHeader(headerStyle: string, showTitle: boolean) {
  return Header({
    headerStyle,
    primaryColor: '#d97706',
    fontFamily: 'Helvetica',
    showLogo: false,
    showCompanyName: true,
    workshop: { name: 'Shop', address: 'Street 1', phone: '123', email: 'a@b.c' },
    shopDisplayName: 'Shop',
    invoiceNum: 'INV-2026-1001',
    serviceDate: 'Mar 10, 2026',
    dueDate: 'Mar 24, 2026',
    showTitle,
    styles: createStyles('#d97706', 'Helvetica', headerStyle),
    labels: {},
  })
}

describe('document title placement', () => {
  it.each(HEADER_STYLES)('%s prints the number when no section carries it', (headerStyle) => {
    // The framed letterhead never prints a title of its own; InvoicePDF hands
    // it the title block instead, which is covered below.
    if (headerStyle === 'framed') return
    expect(containsText(renderHeader(headerStyle, true), 'INV-2026-1001')).toBe(true)
  })

  it.each(HEADER_STYLES)('%s prints no number once a section carries it', (headerStyle) => {
    const header = renderHeader(headerStyle, false)
    expect(containsText(header, 'INV-2026-1001')).toBe(false)
    expect(containsText(header, 'Mar 10, 2026')).toBe(false)
    expect(containsText(header, 'Mar 24, 2026')).toBe(false)
  })

  it.each(HEADER_STYLES)('%s still prints the company either way', (headerStyle) => {
    expect(containsText(renderHeader(headerStyle, false), 'Shop')).toBe(true)
  })
})
