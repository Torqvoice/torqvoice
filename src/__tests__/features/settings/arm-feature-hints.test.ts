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
  HINT_FOR_SETTING,
  INVOICE_DESIGNER_ANNOUNCEMENT,
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
    expect(announcementsToShow({ organizationCreatedAt: '2026-01-04', seen: [DESIGNER] })).toEqual(
      []
    )
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
  })

  it('keeps the designer announcement dated no later than today', () => {
    // A shippedAt in the future gates the announcement off for every existing
    // workshop, which is the silent way for this to never appear at all.
    expect(new Date(SHIPPED).getTime()).toBeLessThanOrEqual(Date.now())
  })
})
