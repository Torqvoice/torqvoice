/**
 * When a feature hint is raised.
 *
 * The rule is narrow on purpose and easy to get wrong in the generous
 * direction. "The link is visible" is not the trigger, because it is true on
 * every page load forever after; "somebody just switched it on" is, and that
 * is a single moment. Getting this wrong means announcing a year-old feature
 * to the workshop that has been using it all year.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  announcementsToShow,
  hintsToArm,
  ANNOUNCEMENTS,
  EMAIL_DESIGNER_ANNOUNCEMENT,
  HINT_FOR_SETTING,
  INVOICE_DESIGNER_ANNOUNCEMENT,
  newSettingsEntries,
  NEW_FOR_DAYS,
  SETTINGS_SHIPPED_AT,
} from '@/features/settings/Lib/featureHints'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

const LOCALES = ['de', 'es', 'fr', 'it', 'lt', 'nb', 'nl', 'pl', 'pt-BR', 'ru', 'tr']

const TIRE = SETTING_KEYS.TIRE_HOTEL_ENABLED
const HINT = HINT_FOR_SETTING[TIRE]

describe('raising a hint', () => {
  it('raises one when a setting is switched on', () => {
    expect(hintsToArm({ entries: { [TIRE]: 'true' }, current: {}, seen: [] })).toEqual([HINT])
  })

  it('stays quiet when the setting was already on', () => {
    // Settings forms submit every field they own on every save, so an
    // already-on toggle arrives on a save that changed something else
    // entirely. Treating that as a flip would re-announce on every save.
    expect(
      hintsToArm({ entries: { [TIRE]: 'true' }, current: { [TIRE]: 'true' }, seen: [] })
    ).toEqual([])
  })

  it('stays quiet when the setting is being switched off', () => {
    expect(
      hintsToArm({ entries: { [TIRE]: 'false' }, current: { [TIRE]: 'true' }, seen: [] })
    ).toEqual([])
  })

  it('stays quiet for a hint already dismissed', () => {
    // Turning something off and back on is not a reason to be told again.
    expect(hintsToArm({ entries: { [TIRE]: 'true' }, current: {}, seen: [HINT] })).toEqual([])
  })

  it('ignores settings that carry no hint', () => {
    const entries = { 'workshop.name': 'true', [SETTING_KEYS.TAX_ENABLED]: 'true' }
    expect(hintsToArm({ entries, current: {}, seen: [] })).toEqual([])
  })

  it('raises each hint once even if a save repeats it', () => {
    const entries = Object.fromEntries(Object.keys(HINT_FOR_SETTING).map((key) => [key, 'true']))
    const raised = hintsToArm({ entries, current: {}, seen: [] })
    expect(new Set(raised).size).toBe(raised.length)
  })
})

describe('the registry', () => {
  it('covers more than the one hint it started with', () => {
    expect(Object.keys(HINT_FOR_SETTING).length).toBeGreaterThan(1)
  })

  it('gives every watched setting a versioned id', () => {
    // Bumping the version is the only way to re-show reworded copy, so an id
    // without one can never be revised.
    for (const id of Object.values(HINT_FOR_SETTING)) {
      expect(id, `${id} is not versioned`).toMatch(/\.v\d+$/)
    }
  })

  it('names hints the sidebar can find copy for', () => {
    // The sidebar looks up featureHints.<prefix>, taking the prefix from the
    // part before the first dot. A missing entry throws in next-intl, on the
    // very screen the hint was meant to help with.
    const messages = JSON.parse(readFileSync('messages/en/featureHints.json', 'utf-8'))
    for (const id of Object.values(HINT_FOR_SETTING)) {
      const prefix = id.split('.')[0]
      expect(messages[prefix], `no copy for ${prefix}`).toBeTruthy()
      expect(messages[prefix].title).toBeTruthy()
      expect(messages[prefix].body).toBeTruthy()
    }
  })

  it('has that copy in every language', () => {
    for (const locale of LOCALES) {
      const messages = JSON.parse(readFileSync(`messages/${locale}/featureHints.json`, 'utf-8'))
      for (const id of Object.values(HINT_FOR_SETTING)) {
        const prefix = id.split('.')[0]
        expect(messages[prefix]?.title, `${locale} has no title for ${prefix}`).toBeTruthy()
        expect(messages[prefix]?.body, `${locale} has no body for ${prefix}`).toBeTruthy()
      }
    }
  })
})

/**
 * Announcing something the product itself gained.
 *
 * The failure worth guarding is the same one in a different disguise: telling
 * somebody about a feature that is not news to them. For a setting flip that
 * meant re-announcing on every save; here it means greeting a workshop that
 * signed up last week with the history of the product, or offering a
 * technician a door their role keeps locked.
 */
const DESIGNER = ANNOUNCEMENTS[0].id
const SHIPPED = ANNOUNCEMENTS[0].shippedAt

describe('showing an announcement', () => {
  it('shows one to a workshop that predates the feature', () => {
    expect(announcementsToShow({ organizationCreatedAt: '2026-01-04', seen: [] })).toContain(
      DESIGNER
    )
  })

  it('stays quiet for a workshop that signed up after it shipped', () => {
    // They have never known the product without it, so it is not news, and a
    // backlog of announcements is a poor way to greet a new customer.
    expect(announcementsToShow({ organizationCreatedAt: '2026-12-01', seen: [] })).toEqual([])
  })

  it('stays quiet once the workshop has been told', () => {
    // Told about all of them: a later announcement is still news after the
    // first has been dismissed, so one seen id does not silence the registry.
    const seen = ANNOUNCEMENTS.map((item) => item.id)
    expect(announcementsToShow({ organizationCreatedAt: '2026-01-04', seen })).toEqual([])
    expect(
      announcementsToShow({ organizationCreatedAt: '2026-01-04', seen: [DESIGNER] })
    ).not.toContain(DESIGNER)
  })

  it('stays quiet for a role that cannot reach the feature', () => {
    // Offering a door that stays locked is worse than saying nothing.
    expect(
      announcementsToShow({
        organizationCreatedAt: '2026-01-04',
        visibleSubjects: ['vehicles', 'work_orders'],
        seen: [],
      })
    ).toEqual([])
  })

  it('shows one to a role that can', () => {
    expect(
      announcementsToShow({
        organizationCreatedAt: '2026-01-04',
        visibleSubjects: ['vehicles', 'settings'],
        seen: [],
      })
    ).toContain(DESIGNER)
  })

  it('stays quiet when the plan does not include the feature', () => {
    // The card cannot be waved away without acknowledging it, so pointing it
    // at an upsell page is a poor way to sell anything.
    expect(
      announcementsToShow({
        organizationCreatedAt: '2026-01-04',
        features: { customTemplates: false },
        seen: [],
      })
    ).toEqual([])
  })

  it('shows one when the plan does include it', () => {
    expect(
      announcementsToShow({
        organizationCreatedAt: '2026-01-04',
        features: { customTemplates: true },
        seen: [],
      })
    ).toContain(DESIGNER)
  })

  it('treats unrestricted access and an unknown signup date as eligible', () => {
    // Owners and admins arrive with no subject list, and an org row without a
    // readable date must not silence an announcement for everybody.
    expect(announcementsToShow({ seen: [] })).toContain(DESIGNER)
    expect(announcementsToShow({ organizationCreatedAt: 'not a date', seen: [] })).toContain(
      DESIGNER
    )
  })
})

describe('the announcement registry', () => {
  it('versions every id, so reworded copy can be shown again', () => {
    for (const announcement of ANNOUNCEMENTS) {
      expect(announcement.id, `${announcement.id} is not versioned`).toMatch(/\.v\d+$/)
    }
  })

  it('ships every announcement with a date the age gate can read', () => {
    for (const announcement of ANNOUNCEMENTS) {
      expect(
        Number.isNaN(new Date(announcement.shippedAt).getTime()),
        `${announcement.id} has an unreadable shippedAt`
      ).toBe(false)
    }
  })

  it('carries a title, a body and a link label in every language', () => {
    // The card renders all three. A missing one throws in next-intl, on the
    // screen the announcement was meant to help with.
    for (const locale of ['en', ...LOCALES]) {
      const messages = JSON.parse(readFileSync(`messages/${locale}/featureHints.json`, 'utf-8'))
      for (const announcement of ANNOUNCEMENTS) {
        const prefix = announcement.id.split('.')[0]
        for (const field of ['title', 'body', 'cta']) {
          expect(messages[prefix]?.[field], `${locale} has no ${field} for ${prefix}`).toBeTruthy()
        }
      }
    }
  })

  it('points every announcement at a real destination', () => {
    for (const announcement of ANNOUNCEMENTS) {
      expect(announcement.href.startsWith('/'), `${announcement.id} needs an app path`).toBe(true)
    }
  })

  it('sends people to the page that owns the designer, not straight into it', () => {
    // Landing in a full-screen tool teaches nobody where it lives, and the
    // question comes back next week.
    const designer = ANNOUNCEMENTS.find((item) => item.id === INVOICE_DESIGNER_ANNOUNCEMENT)
    expect(designer?.href).toBe('/settings/templates')
    const email = ANNOUNCEMENTS.find((item) => item.id === EMAIL_DESIGNER_ANNOUNCEMENT)
    expect(email?.href).toBe('/settings/email-templates')
  })

  it('keeps the designer announcement dated no later than today', () => {
    // A shippedAt in the future gates the announcement off for every existing
    // workshop, which is the silent way for this to never appear at all.
    expect(new Date(SHIPPED).getTime()).toBeLessThanOrEqual(Date.now())
  })
})

/**
 * The "New" pill on a settings entry.
 *
 * Nothing is stored, so the only things that can go wrong are the two dates.
 * A pill that never ages out is furniture, and one shown to a workshop that
 * signed up after the feature is the same non-news the announcements avoid.
 */
describe('the New pill on a settings entry', () => {
  const shippedAt = { '/settings/example': '2026-09-08' }
  const day = 24 * 60 * 60 * 1000
  const shipped = new Date('2026-09-08').getTime()

  it('shows for a workshop that predates the feature, while it is fresh', () => {
    const now = new Date(shipped + 3 * day)
    expect(newSettingsEntries({ shippedAt, organizationCreatedAt: '2026-01-01', now })).toEqual([
      '/settings/example',
    ])
  })

  it('ages out after the window', () => {
    const now = new Date(shipped + NEW_FOR_DAYS * day)
    expect(newSettingsEntries({ shippedAt, organizationCreatedAt: '2026-01-01', now })).toEqual([])
  })

  it('stays off before the feature has shipped', () => {
    const now = new Date(shipped - day)
    expect(newSettingsEntries({ shippedAt, organizationCreatedAt: '2026-01-01', now })).toEqual([])
  })

  it('stays off for a workshop that signed up after it shipped', () => {
    const now = new Date(shipped + 3 * day)
    expect(newSettingsEntries({ shippedAt, organizationCreatedAt: '2026-09-09', now })).toEqual([])
  })

  it('treats an unknown signup date as old enough to be told', () => {
    const now = new Date(shipped + 3 * day)
    expect(newSettingsEntries({ shippedAt, organizationCreatedAt: null, now })).toEqual([
      '/settings/example',
    ])
  })

  it('never pins a pill on an entry with an unreadable date', () => {
    const now = new Date(shipped + 3 * day)
    expect(
      newSettingsEntries({
        shippedAt: { '/settings/example': 'soon' },
        organizationCreatedAt: null,
        now,
      })
    ).toEqual([])
  })

  it('ships every registered entry with a date the rule can read, no later than today', () => {
    for (const [href, date] of Object.entries(SETTINGS_SHIPPED_AT)) {
      expect(href.startsWith('/settings/'), `${href} is not a settings path`).toBe(true)
      const time = new Date(date).getTime()
      expect(Number.isNaN(time), `${href} has an unreadable shippedAt`).toBe(false)
      expect(time, `${href} is dated in the future`).toBeLessThanOrEqual(Date.now())
    }
  })

  it('reads the pill label in every language', () => {
    for (const locale of ['en', ...LOCALES]) {
      const messages = JSON.parse(readFileSync(`messages/${locale}/settings.json`, 'utf-8'))
      expect(messages.nav?.new, `${locale} has no nav.new`).toBeTruthy()
    }
  })
})
