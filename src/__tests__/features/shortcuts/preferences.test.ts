import { describe, expect, it } from 'vitest'
import { hasModifier, isReservedCombo, parseCombo } from '@/features/shortcuts/Lib/keys'
import {
  activeKeys,
  assignedKeys,
  assignKey,
  comboProblem,
  DEFAULT_SHORTCUT_PREFS,
  findClash,
  isDefaultShortcutPrefs,
  matchShortcut,
  startsSequence,
  normalizeShortcutPrefs,
  resetKey,
  setSwitchedOff,
  type ShortcutPrefs,
} from '@/features/shortcuts/Lib/preferences'
import { SHORTCUTS, type ShortcutDef, shortcutById } from '@/features/shortcuts/Lib/registry'
import { ACTION_COMMANDS, PAGE_COMMANDS } from '@/features/search/Lib/commands'

const def = (id: string) => shortcutById(id) as ShortcutDef
const everything = { typing: false, layerOpen: false, available: () => true }
const match = (combo: string, over: Partial<Parameters<typeof matchShortcut>[1]> = {}) =>
  matchShortcut([combo], { prefs: DEFAULT_SHORTCUT_PREFS, ...everything, ...over })?.id ?? null

describe('the shortcut registry', () => {
  it('names every shortcut once', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ships no two shortcuts on the same key', () => {
    const seen = new Map<string, string>()
    for (const shortcut of SHORTCUTS) {
      for (const combo of [...shortcut.defaultKeys, ...(shortcut.fixedKeys ?? [])]) {
        expect(
          seen.get(combo),
          `${combo} is on ${seen.get(combo)} and ${shortcut.id}`
        ).toBeUndefined()
        seen.set(combo, shortcut.id)
      }
    }
  })

  it('ships only keys a browser will hand over', () => {
    for (const shortcut of SHORTCUTS) {
      for (const combo of shortcut.defaultKeys) {
        expect(parseCombo(combo), combo).not.toBeNull()
        expect(isReservedCombo(combo), combo).toBe(false)
      }
    }
  })

  it('puts Ctrl or Alt on everything that works on every page', () => {
    for (const shortcut of SHORTCUTS.filter((s) => s.scope === 'global')) {
      for (const combo of shortcut.defaultKeys) expect(hasModifier(combo), combo).toBe(true)
    }
  })

  it('keeps the keys people already knew', () => {
    expect(def('general.search').defaultKeys).toEqual(['mod+k'])
    expect(def('general.plateLookup').defaultKeys).toEqual(['mod+shift+l'])
    expect(def('general.save').defaultKeys).toEqual(['mod+s'])
    expect(def('general.sidebar').defaultKeys).toEqual(['mod+b'])
    expect(def('calendar.week').defaultKeys).toEqual(['w'])
    expect(activeKeys(def('calendar.next'), DEFAULT_SHORTCUT_PREFS)).toEqual([
      'j',
      'n',
      'arrowright',
    ])
    expect(activeKeys(def('calendar.previous'), DEFAULT_SHORTCUT_PREFS)).toEqual([
      'k',
      'p',
      'arrowleft',
    ])
  })

  it('creates with Alt and the first letter', () => {
    expect(def('create.workOrder').defaultKeys).toEqual(['alt+w'])
    expect(def('create.quote').defaultKeys).toEqual(['alt+q'])
    expect(def('create.customer').defaultKeys).toEqual(['alt+c'])
    expect(def('create.part').defaultKeys).toEqual(['alt+p'])
    expect(def('create.inspection').defaultKeys).toEqual(['alt+i'])
  })

  it('gives pages no single chord of their own: search and the go-to set open them', () => {
    for (const shortcut of SHORTCUTS.filter((s) => s.group === 'goTo')) {
      expect(shortcut.defaultKeys, shortcut.id).toEqual([])
      expect(activeKeys(shortcut, DEFAULT_SHORTCUT_PREFS), shortcut.id).toEqual(
        shortcut.sequence ? [shortcut.sequence] : []
      )
    }
  })

  it('points every page and create shortcut at a command the search palette has', () => {
    const commands = new Map(
      [...PAGE_COMMANDS, ...ACTION_COMMANDS].map((command) => [command.id, command.href])
    )
    for (const shortcut of SHORTCUTS.filter((s) => s.command)) {
      expect(commands.get(shortcut.command as string), shortcut.id).toBe(shortcut.href)
    }
  })
})

describe('when a shortcut fires', () => {
  it('fires a chord while typing in a field', () => {
    expect(match('alt+w', { typing: true })).toBe('create.workOrder')
    expect(match('mod+k', { typing: true })).toBe('general.search')
  })

  it('never fires a bare letter while typing', () => {
    expect(match('w')).toBe('calendar.week')
    expect(match('w', { typing: true })).toBeNull()
    expect(match('arrowright', { typing: true })).toBeNull()
  })

  it('leaves an open dialog alone, except for search, save and the like', () => {
    expect(match('alt+w', { layerOpen: true })).toBeNull()
    expect(match('w', { layerOpen: true })).toBeNull()
    expect(match('mod+k', { layerOpen: true })).toBe('general.search')
  })

  it('does nothing for a screen that is not there or a page this person cannot open', () => {
    const available = (s: ShortcutDef) => s.id !== 'calendar.week' && s.id !== 'create.quote'
    expect(match('w', { available })).toBeNull()
    expect(match('alt+q', { available })).toBeNull()
  })

  it('does nothing at all once shortcuts are switched off', () => {
    const prefs = { ...DEFAULT_SHORTCUT_PREFS, enabled: false }
    expect(match('alt+w', { prefs })).toBeNull()
    expect(match('mod+k', { prefs })).toBeNull()
  })

  it('drops the single letters, and only those, when single-letter keys are off', () => {
    const prefs = { ...DEFAULT_SHORTCUT_PREFS, singleKeys: false }
    expect(match('w', { prefs })).toBeNull()
    expect(match('j', { prefs })).toBeNull()
    expect(match('arrowright', { prefs })).toBe('calendar.next')
    expect(match('alt+w', { prefs })).toBe('create.workOrder')
  })

  it('leaves out one shortcut that was switched off', () => {
    const prefs = setSwitchedOff(def('create.quote'), true, DEFAULT_SHORTCUT_PREFS)
    expect(match('alt+q', { prefs })).toBeNull()
    expect(match('alt+w', { prefs })).toBe('create.workOrder')
  })
})

describe('Alt+G, then Alt and a letter', () => {
  const off = { ...DEFAULT_SHORTCUT_PREFS, goToSequences: false }

  it('opens a page, and is on unless someone switched it off', () => {
    expect(startsSequence('alt+g', { prefs: DEFAULT_SHORTCUT_PREFS, ...everything })).toBe(true)
    expect(match('alt+g alt+w')).toBe('goTo.workOrders')
    expect(match('alt+g alt+q')).toBe('goTo.quotes')
    expect(match('alt+g alt+g')).toBe('goTo.dashboard')
    expect(match('alt+g alt+w', { prefs: off })).toBeNull()
    expect(startsSequence('alt+g', { prefs: off, ...everything })).toBe(false)
  })

  it('is never made of a bare letter, in either press', () => {
    for (const shortcut of SHORTCUTS.filter((s) => s.sequence)) {
      expect(shortcut.sequence, shortcut.id).toMatch(/^alt\+g alt\+[a-z]$/)
    }
    expect(match('g w')).toBeNull()
    expect(match('alt+g w')).toBeNull()
    expect(match('g alt+w')).toBeNull()
    expect(startsSequence('g', { prefs: DEFAULT_SHORTCUT_PREFS, ...everything })).toBe(false)
  })

  it('works with the cursor in a field, like any other chord, but not over a dialog', () => {
    expect(
      startsSequence('alt+g', { prefs: DEFAULT_SHORTCUT_PREFS, ...everything, typing: true })
    ).toBe(true)
    expect(match('alt+g alt+w', { typing: true })).toBe('goTo.workOrders')
    expect(
      startsSequence('alt+g', { prefs: DEFAULT_SHORTCUT_PREFS, ...everything, layerOpen: true })
    ).toBe(false)
    expect(match('alt+g alt+w', { layerOpen: true })).toBeNull()
  })

  it('does not depend on the single-letter switch, having no single letters', () => {
    const prefs = { ...DEFAULT_SHORTCUT_PREFS, singleKeys: false }
    expect(match('alt+g alt+w', { prefs })).toBe('goTo.workOrders')
  })

  it('uses a different letter for every page, and the create letter for the same thing', () => {
    const sequences = SHORTCUTS.flatMap((s) => (s.sequence ? [s.sequence] : []))
    expect(new Set(sequences).size).toBe(sequences.length)
    const letter = (id: string) => def(id).sequence?.slice(-1)
    expect(letter('goTo.workOrders')).toBe(def('create.workOrder').defaultKeys[0].slice(-1))
    expect(letter('goTo.quotes')).toBe(def('create.quote').defaultKeys[0].slice(-1))
    expect(letter('goTo.customers')).toBe(def('create.customer').defaultKeys[0].slice(-1))
    expect(letter('goTo.vehicles')).toBe(def('create.vehicle').defaultKeys[0].slice(-1))
    expect(letter('goTo.inventory')).toBe(def('create.part').defaultKeys[0].slice(-1))
    expect(letter('goTo.inspections')).toBe(def('create.inspection').defaultKeys[0].slice(-1))
  })
})

/**
 * What Windows and the browsers on it already do with a key, from their own
 * lists (read 16 Nov 2026):
 *   Windows: support.microsoft.com, "Keyboard shortcuts in Windows"
 *   Edge:    support.microsoft.com, "Keyboard shortcuts in Microsoft Edge"
 *   Chrome:  support.google.com/chrome/answer/157179
 *   Firefox: the letters of its menu bar, which open a menu even when the
 *            page has handled the key (bugzilla.mozilla.org 367510), and
 *            bugzilla.mozilla.org 1962297 for Alt+Shift.
 * A default added later that lands on one of these fails here.
 */
describe('defaults against Windows, Edge, Chrome and Firefox', () => {
  const TAKEN: Record<string, string> = {
    // Windows itself
    'alt+tab': 'Windows: switch between windows',
    'alt+escape': 'Windows: cycle through windows',
    'alt+f4': 'Windows: close the window',
    'alt+space': 'Windows: the window menu',
    'alt+enter': 'Windows: properties; Chrome: search in a new tab',
    'alt+printscreen': 'Windows: screenshot of the window',
    'alt+pageup': 'Windows: move up one screen',
    'alt+pagedown': 'Windows: move down one screen',
    'alt+arrowleft': 'Windows and every browser: back',
    'alt+arrowright': 'Windows and every browser: forward',
    'alt+arrowup': 'File Explorer: up one level',
    'alt+home': 'Edge, Chrome, Firefox: home page',
    'alt+a': 'Windows 11: suggested actions',
    // Edge and Chrome
    'alt+d': 'Edge, Chrome, Firefox: the address bar',
    'alt+e': 'Edge, Chrome: the browser menu; Firefox: Edit menu',
    'alt+f': 'Edge, Chrome: the browser menu; Firefox: File menu',
    // Firefox menu bar
    'alt+v': 'Firefox: View menu',
    'alt+s': 'Firefox: History menu',
    'alt+b': 'Firefox: Bookmarks menu',
    'alt+t': 'Firefox: Tools menu',
    'alt+h': 'Firefox: Help menu',
    // Ctrl chords no page can take, or that would break editing
    'mod+w': 'close the tab',
    'mod+t': 'new tab',
    'mod+n': 'new window',
    'mod+q': 'quit (Firefox on Linux)',
    'mod+tab': 'next tab',
    'mod+r': 'reload',
    'mod+l': 'the address bar',
    'mod+d': 'bookmark the page',
    'mod+h': 'history',
    'mod+j': 'downloads',
    'mod+p': 'print',
    'mod+f': 'find on the page',
    'mod+c': 'copy',
    'mod+v': 'paste',
    'mod+x': 'cut',
    'mod+a': 'select all',
    'mod+z': 'undo',
    'mod+y': 'redo',
    'mod+shift+t': 'reopen the closed tab',
    'mod+shift+n': 'private window',
    'mod+shift+w': 'close the window',
    'mod+shift+i': 'developer tools',
    'mod+shift+delete': 'clear browsing data',
  }

  // Every press that ships: the single chords, and both halves of each
  // go-to sequence (Alt+G, then Alt and the letter).
  const defaults = SHORTCUTS.flatMap((s) =>
    [...s.defaultKeys, ...(s.fixedKeys ?? []), ...(s.sequence?.split(' ') ?? [])].map((combo) => ({
      id: s.id,
      combo,
    }))
  )

  it.each(defaults)('$id on $combo is not a Windows or browser key', ({ combo }) => {
    expect(TAKEN[combo]).toBeUndefined()
  })

  it.each(defaults)('$id on $combo has no Alt+Shift, AltGr or Windows key', ({ combo }) => {
    const parsed = parseCombo(combo)
    expect(parsed).not.toBeNull()
    // Alt+Shift switches the keyboard language on Windows.
    expect(parsed?.alt && parsed?.shift).toBeFalsy()
    // Ctrl+Alt is AltGr on European keyboards.
    expect(parsed?.mod && parsed?.alt).toBeFalsy()
    expect(combo).not.toMatch(/meta|win|os\+/)
  })

  it('refuses every one of those keys when a person tries to record it', () => {
    for (const combo of Object.keys(TAKEN)) expect(isReservedCombo(combo), combo).toBe(true)
  })

  it('keeps only the Ctrl chords the app already had, which browsers let a page take', () => {
    const ctrl = defaults.filter(({ combo }) => combo.startsWith('mod+')).map(({ combo }) => combo)
    expect([...new Set(ctrl)].sort()).toEqual(['mod+/', 'mod+b', 'mod+k', 'mod+s', 'mod+shift+l'])
  })
})

describe('changing a key', () => {
  it('fires on the new key and no longer on the old one', () => {
    const prefs = assignKey(def('create.workOrder'), 'alt+n', DEFAULT_SHORTCUT_PREFS)
    expect(match('alt+n', { prefs })).toBe('create.workOrder')
    expect(match('alt+w', { prefs })).toBeNull()
  })

  it('names the shortcut that already holds a key', () => {
    expect(findClash(def('create.quote'), 'alt+w', DEFAULT_SHORTCUT_PREFS)?.id).toBe(
      'create.workOrder'
    )
    expect(findClash(def('create.quote'), 'alt+z', DEFAULT_SHORTCUT_PREFS)).toBeNull()
  })

  it('sees a clash with a key on another screen, and with a fixed one', () => {
    expect(findClash(def('calendar.today'), 'w', DEFAULT_SHORTCUT_PREFS)?.id).toBe('calendar.week')
    expect(findClash(def('calendar.today'), 'arrowright', DEFAULT_SHORTCUT_PREFS)?.id).toBe(
      'calendar.next'
    )
  })

  it('takes the key from the shortcut that had it', () => {
    const prefs = assignKey(def('create.quote'), 'alt+w', DEFAULT_SHORTCUT_PREFS)
    expect(assignedKeys(def('create.quote'), prefs)).toEqual(['alt+w'])
    expect(assignedKeys(def('create.workOrder'), prefs)).toEqual([])
    expect(match('alt+w', { prefs })).toBe('create.quote')
  })

  it('leaves the second key when one of two is taken', () => {
    const prefs = assignKey(def('calendar.today'), 'j', DEFAULT_SHORTCUT_PREFS)
    expect(assignedKeys(def('calendar.next'), prefs)).toEqual(['n'])
  })

  it('keeps a key someone chose before a later default claimed it', () => {
    // Alt+L was free for anyone to take until New appointment shipped on it.
    const prefs = normalizeShortcutPrefs({ overrides: { 'goTo.calendar': 'alt+l' } })
    expect(match('alt+l', { prefs })).toBe('goTo.calendar')
    expect(assignedKeys(def('create.appointment'), prefs)).toEqual([])
    expect(findClash(def('create.quote'), 'alt+l', prefs)?.id).toBe('goTo.calendar')
    // Everyone else still gets the new default.
    expect(match('alt+l')).toBe('create.appointment')
  })

  it('gives the default back once the person moves their own key elsewhere', () => {
    const chosen = normalizeShortcutPrefs({ overrides: { 'goTo.calendar': 'alt+l' } })
    const moved = assignKey(def('goTo.calendar'), 'alt+z', chosen)
    expect(match('alt+l', { prefs: moved })).toBe('create.appointment')
  })

  it('goes back to the shipped key on reset', () => {
    const changed = assignKey(def('create.workOrder'), 'alt+n', DEFAULT_SHORTCUT_PREFS)
    const prefs = resetKey(def('create.workOrder'), changed)
    expect(assignedKeys(def('create.workOrder'), prefs)).toEqual(['alt+w'])
    expect(isDefaultShortcutPrefs(prefs)).toBe(true)
  })

  it('refuses a browser key, and a bare letter for something that works everywhere', () => {
    expect(comboProblem(def('create.workOrder'), 'mod+w')).toBe('reserved')
    expect(comboProblem(def('create.workOrder'), 'w')).toBe('needsModifier')
    expect(comboProblem(def('calendar.week'), 'v')).toBeNull()
    expect(comboProblem(def('create.workOrder'), 'alt+n')).toBeNull()
  })

  it('refuses the first press of the go-to set, which would leave every page key dead', () => {
    expect(comboProblem(def('create.quote'), 'alt+g')).toBe('taken')
    expect(normalizeShortcutPrefs({ overrides: { 'create.quote': 'alt+g' } }).overrides).toEqual({})
  })

  it('refuses a key that is fixed to another shortcut and cannot be taken from it', () => {
    expect(comboProblem(def('calendar.previous'), 'arrowright')).toBe('taken')
    expect(comboProblem(def('calendar.next'), 'arrowright')).toBeNull()
  })
})

describe('reading stored preferences', () => {
  it('reads nothing as every default', () => {
    expect(normalizeShortcutPrefs(null)).toEqual(DEFAULT_SHORTCUT_PREFS)
    expect(normalizeShortcutPrefs('nonsense')).toEqual(DEFAULT_SHORTCUT_PREFS)
  })

  it('drops shortcuts that no longer exist and keys that could never work', () => {
    const prefs = normalizeShortcutPrefs({
      enabled: true,
      singleKeys: false,
      overrides: {
        'create.workOrder': 'alt+n',
        'create.quote': 'mod+w',
        'create.customer': 'c',
        'gone.shortcut': 'alt+x',
        'create.part': 42,
      },
      disabled: ['create.vehicle', 'gone.shortcut', 'create.vehicle'],
    } as unknown as ShortcutPrefs)
    expect(prefs).toEqual({
      enabled: true,
      singleKeys: false,
      goToSequences: true,
      overrides: { 'create.workOrder': 'alt+n' },
      disabled: ['create.vehicle'],
    })
  })

  it('keeps a shortcut that was left without a key', () => {
    const prefs = normalizeShortcutPrefs({ overrides: { 'create.workOrder': '' } })
    expect(assignedKeys(def('create.workOrder'), prefs)).toEqual([])
  })
})
