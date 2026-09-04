/**
 * The catalog's search box.
 *
 * Twenty-odd vendors is more than a page of cards worth scanning, so the box
 * has to find one by whatever the workshop happens to remember: the vendor's
 * name, what it does, or the category it sits in. It searches the translated
 * text the cards actually show, and only the list of what can be added: what
 * the workshop already runs is not what it is shopping through, and watching
 * that list empty out while you type reads as though something came undone.
 */

import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { IntegrationsCatalog } from '@/app/(authenticated)/settings/integrations/integrations-catalog'
import type { CatalogEntry } from '@/features/integrations/Actions/integrationActions'
import { getManifest } from '@/integrations/registry'

function entry(id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  const manifest = getManifest(id)
  if (!manifest) throw new Error(`no manifest for ${id}`)
  return {
    manifest,
    status: null,
    externalAccountName: null,
    lastError: null,
    platformApp: true,
    featured: true,
    ...overrides,
  }
}

const ENTRIES: CatalogEntry[] = [
  entry('openai'),
  entry('google-calendar'),
  entry('twilio-sms'),
  entry('zoom', { status: 'active', externalAccountName: 'workshop@example.com' }),
]

function show() {
  render(<IntegrationsCatalog entries={ENTRIES} />)
  return screen.getByRole('searchbox')
}

/**
 * The two lists, told apart by their call to action: a connected row offers
 * Manage, an available card offers Connect. ("Connect" alone would not do
 * it: a connected row also carries the word Connected.)
 */
function listed(action: 'Manage' | 'Connect'): string[] {
  const links = screen.queryAllByRole('link')
  return ENTRIES.map((e) => e.manifest.name).filter((name) =>
    links.some((l) => {
      if (!l.textContent?.startsWith(name)) return false
      const manage = l.textContent.includes('Manage')
      return action === 'Manage' ? manage : !manage
    })
  )
}

/** The vendors offered in the "Available" grid, which the search narrows. */
function offered(): string[] {
  return listed('Connect')
}

/** The vendors listed as already set up, which it does not. */
function connected(): string[] {
  return listed('Manage')
}

describe('integration search', () => {
  it('shows everything until something is typed', () => {
    show()
    expect(offered()).toEqual(['OpenAI', 'Google Calendar', 'Twilio'])
    expect(connected()).toEqual(['Zoom'])
  })

  it('finds a vendor by name, whatever it is called', () => {
    const box = show()
    fireEvent.change(box, { target: { value: 'twil' } })
    expect(offered()).toEqual(['Twilio'])
  })

  it('leaves what is already connected alone', () => {
    const box = show()
    fireEvent.change(box, { target: { value: 'twil' } })
    // Zoom is connected: it stays listed, with its account, whatever is typed.
    expect(connected()).toEqual(['Zoom'])
    expect(screen.getByText('workshop@example.com')).toBeInTheDocument()
  })

  it('searches what a vendor does, not just its name', () => {
    const box = show()
    // "Plate and VIN lookup" is a capability badge; "Model" is in OpenAI's text.
    fireEvent.change(box, { target: { value: 'summaries' } })
    expect(offered()).toEqual(['OpenAI'])
  })

  it('searches the category as it is shown', () => {
    const box = show()
    fireEvent.change(box, { target: { value: 'messaging' } })
    expect(offered()).toEqual(['Twilio'])
  })

  it('finds every vendor that does a thing, not only the one named after it', () => {
    const box = show()
    // Google Calendar puts video call links on the events it writes.
    fireEvent.change(box, { target: { value: 'video call' } })
    expect(offered()).toEqual(['Google Calendar'])
  })

  it('ignores case and accents', () => {
    const box = show()
    fireEvent.change(box, { target: { value: '  GOOGLE  ' } })
    expect(offered()).toEqual(['Google Calendar'])
  })

  it('says a search found nothing, rather than looking empty', () => {
    const box = show()
    fireEvent.change(box, { target: { value: 'quickbooks' } })
    expect(offered()).toEqual([])
    expect(screen.getByText('Nothing matches "quickbooks".')).toBeInTheDocument()
    // The connected card is untouched: nothing there says the search failed.
    expect(connected()).toEqual(['Zoom'])
  })

  it('composes with the category filter', () => {
    const box = show()
    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    expect(offered()).toEqual(['OpenAI'])

    fireEvent.change(box, { target: { value: 'google' } })
    expect(screen.queryByText('Google Calendar')).toBeNull()
    expect(screen.getByText('Nothing matches "google".')).toBeInTheDocument()
  })
})
