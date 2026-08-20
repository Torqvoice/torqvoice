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
import { hintsToArm, HINT_FOR_SETTING } from '@/features/settings/Lib/featureHints'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

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
    const locales = ['de', 'es', 'fr', 'it', 'lt', 'nb', 'nl', 'pl', 'pt-BR', 'ru', 'tr']
    for (const locale of locales) {
      const messages = JSON.parse(readFileSync(`messages/${locale}/featureHints.json`, 'utf-8'))
      for (const id of Object.values(HINT_FOR_SETTING)) {
        const prefix = id.split('.')[0]
        expect(messages[prefix]?.title, `${locale} has no title for ${prefix}`).toBeTruthy()
        expect(messages[prefix]?.body, `${locale} has no body for ${prefix}`).toBeTruthy()
      }
    }
  })
})
