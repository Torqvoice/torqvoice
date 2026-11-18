import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSettingsSearchItems } from '@/features/search/Lib/settingsItems'
import { prepareQuery, rank } from '@/features/search/Lib/matcher'
import {
  visibleActionCommands,
  visiblePageCommands,
} from '@/features/search/Lib/commands'

/**
 * The real index, titled in English through the test setup's next-intl
 * mock, run through the real matcher: what a workshop actually types.
 */
function items(opts: Parameters<typeof useSettingsSearchItems>[0] = {}) {
  return renderHook(() => useSettingsSearchItems(opts)).result.current
}

function top(query: string, n = 3, opts?: Parameters<typeof useSettingsSearchItems>[0]) {
  return rank(prepareQuery(query), items(opts), n).map((r) => r.item)
}

describe('settings search items', () => {
  it('lists every page on a self-hosted install, with the cloud-only ones left out', () => {
    const pages = items({ isCloud: false }).filter((i) => i.item.kind === 'settingsPage')
    const keys = pages.map((p) => p.item.page)
    expect(keys).toContain('company')
    expect(keys).toContain('license')
    expect(keys).not.toContain('subscription')
    expect(keys).not.toContain('support')
  })

  it('swaps the licence page for the subscription page on the cloud', () => {
    const keys = items({ isCloud: true, supportEnabled: true })
      .filter((i) => i.item.kind === 'settingsPage')
      .map((p) => p.item.page)
    expect(keys).toContain('subscription')
    expect(keys).toContain('support')
    expect(keys).not.toContain('license')
  })

  it('finds the tax page by its foreign aliases', () => {
    for (const word of ['vat', 'mva', 'mwst']) {
      expect(top(word, 1)[0]?.page, word).toBe('tax')
    }
  })

  it('lands "logo" on the company logo card, with its anchor', () => {
    const hit = top('logo', 1)[0]
    expect(hit?.page).toBe('company')
    expect(hit?.anchor).toBeTruthy()
    expect(hit?.href).toContain('#')
  })

  it('lands "due days" on the invoice field', () => {
    const hit = top('due days', 1)[0]
    expect(hit?.page).toBe('invoice')
    expect(hit?.href).toBe('/settings/invoice#dueDays')
  })

  it('finds a setting by what it does, not only what it is called', () => {
    expect(top('timezone', 1)[0]?.page).toBe('localization')
    expect(top('two factor', 1)[0]?.page).toBe('account')
    expect(top('backup', 1)[0]?.page).toBe('data')
    expect(top('dark mode', 1)[0]?.page).toBe('appearance')
  })

  it('puts the page itself above its fields when the page is what was typed', () => {
    const [first] = top('warranty', 1)
    expect(first?.kind).toBe('settingsPage')
    expect(first?.page).toBe('warranty')
  })

  it('marks a gated page as locked without the feature', () => {
    const features = { customTemplates: false } as never
    const templates = items({ features }).find((i) => i.item.id === 'page:templates')
    expect(templates?.item.locked).toBe(true)
  })

  it('writes a breadcrumb for every setting', () => {
    for (const { item } of items()) {
      if (item.kind === 'setting') expect(item.breadcrumb, item.id).toContain(' › ')
    }
  })
})

describe('page and action commands', () => {
  it('hides pages the role cannot open', () => {
    const pages = visiblePageCommands({ visibleSubjects: ['customers'] }).map((p) => p.id)
    expect(pages).toContain('page:customers')
    expect(pages).not.toContain('page:billing')
    expect(pages).not.toContain('page:settings')
  })

  it('lists opt-in modules only when they are on', () => {
    expect(visiblePageCommands({}).map((p) => p.id)).not.toContain('page:tire-hotel')
    expect(visiblePageCommands({ tireHotelEnabled: true }).map((p) => p.id)).toContain(
      'page:tire-hotel'
    )
  })

  it('offers the invitation only to admins', () => {
    expect(visibleActionCommands({}).map((a) => a.id)).not.toContain('action:invite-member')
    expect(visibleActionCommands({ isAdminOrOwner: true }).map((a) => a.id)).toContain(
      'action:invite-member'
    )
  })
})
