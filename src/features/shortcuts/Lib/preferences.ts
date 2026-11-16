import { type Combo, hasModifier, isCharacterKey, isReservedCombo, parseCombo } from './keys'
import { SHORTCUTS, type ShortcutDef, shortcutById } from './registry'

/**
 * What one person changed about their shortcuts (User.keyboardShortcuts).
 * Only differences from the registry are kept, so a default that changes in
 * a later release reaches everyone who never touched it.
 */
export type ShortcutPrefs = {
  /** Off: no shortcut in the registry does anything. */
  enabled: boolean
  /** Off: bare character keys (the calendar's letters) do nothing. */
  singleKeys: boolean
  /** On: Alt+G, then Alt and a page's letter, opens that page. */
  goToSequences: boolean
  /** Shortcut id to the one key that replaces its defaults; '' is no key. */
  overrides: Record<string, Combo>
  /** Shortcut ids switched off. */
  disabled: string[]
}

export const DEFAULT_SHORTCUT_PREFS: ShortcutPrefs = {
  enabled: true,
  singleKeys: true,
  goToSequences: true,
  overrides: {},
  disabled: [],
}

export type ComboProblem = 'invalid' | 'reserved' | 'needsModifier'

/** Why a key cannot be given to this shortcut, or null when it can. */
export function comboProblem(def: ShortcutDef, combo: Combo): ComboProblem | null {
  if (!parseCombo(combo)) return 'invalid'
  if (isReservedCombo(combo)) return 'reserved'
  // A shortcut that works on every page would otherwise fire on a letter
  // meant for nothing in particular.
  if (def.scope === 'global' && !hasModifier(combo)) return 'needsModifier'
  return null
}

/**
 * Whatever was stored or sent, as preferences that can be trusted: unknown
 * shortcuts and keys that could never work are dropped rather than refused,
 * so a shortcut removed from the registry does not break anyone's settings.
 */
export function normalizeShortcutPrefs(input: unknown): ShortcutPrefs {
  if (!input || typeof input !== 'object') return DEFAULT_SHORTCUT_PREFS
  const raw = input as Record<string, unknown>
  const overrides: Record<string, Combo> = {}
  if (raw.overrides && typeof raw.overrides === 'object') {
    for (const [id, combo] of Object.entries(raw.overrides as Record<string, unknown>)) {
      const def = shortcutById(id)
      if (!def || typeof combo !== 'string') continue
      if (combo === '') {
        if (def.defaultKeys.length > 0) overrides[id] = ''
        continue
      }
      if (comboProblem(def, combo)) continue
      if (def.defaultKeys.length === 1 && def.defaultKeys[0] === combo) continue
      overrides[id] = combo
    }
  }
  const disabled = Array.isArray(raw.disabled)
    ? [...new Set(raw.disabled.filter((id): id is string => typeof id === 'string'))].filter(
        (id) => !!shortcutById(id)
      )
    : []
  return {
    enabled: raw.enabled !== false,
    singleKeys: raw.singleKeys !== false,
    goToSequences: raw.goToSequences !== false,
    overrides,
    disabled,
  }
}

export function isDefaultShortcutPrefs(prefs: ShortcutPrefs): boolean {
  return (
    prefs.enabled &&
    prefs.singleKeys &&
    prefs.goToSequences &&
    prefs.disabled.length === 0 &&
    Object.keys(prefs.overrides).length === 0
  )
}

/** The keys a person may change: their own, or the ones it shipped with. */
export function assignedKeys(def: ShortcutDef, prefs: ShortcutPrefs): Combo[] {
  const override = prefs.overrides[def.id]
  if (override === undefined) return def.defaultKeys
  return override ? [override] : []
}

export function isChanged(def: ShortcutDef, prefs: ShortcutPrefs): boolean {
  return prefs.overrides[def.id] !== undefined
}

export function isSwitchedOff(def: ShortcutDef, prefs: ShortcutPrefs): boolean {
  return prefs.disabled.includes(def.id)
}

/** The keys that fire it right now, the fixed ones included. */
export function activeKeys(def: ShortcutDef, prefs: ShortcutPrefs): Combo[] {
  if (!prefs.enabled || isSwitchedOff(def, prefs)) return []
  const keys = [...assignedKeys(def, prefs), ...(def.fixedKeys ?? [])]
  if (def.sequence && prefs.goToSequences) keys.push(def.sequence)
  return prefs.singleKeys ? keys : keys.filter((combo) => !isCharacterKey(combo))
}

/**
 * The other shortcut that already holds this key, if any. A key is held
 * whether or not its shortcut is switched off, and whatever screen it works
 * on: the calendar's W and a global W would fight on the calendar.
 */
export function findClash(
  def: ShortcutDef,
  combo: Combo,
  prefs: ShortcutPrefs,
  consider: (other: ShortcutDef) => boolean = () => true
): ShortcutDef | null {
  for (const other of SHORTCUTS) {
    if (other.id === def.id || !consider(other)) continue
    const held = [...assignedKeys(other, prefs), ...(other.fixedKeys ?? [])]
    if (held.includes(combo)) return other
  }
  return null
}

/** Gives `combo` to a shortcut, taking it from whichever one held it. */
export function assignKey(def: ShortcutDef, combo: Combo, prefs: ShortcutPrefs): ShortcutPrefs {
  const overrides = { ...prefs.overrides }
  for (const other of SHORTCUTS) {
    if (other.id === def.id) continue
    const keys = assignedKeys(other, prefs)
    if (!keys.includes(combo)) continue
    const rest = keys.filter((key) => key !== combo)
    overrides[other.id] = rest[0] ?? ''
  }
  overrides[def.id] = combo
  return normalizeShortcutPrefs({ ...prefs, overrides })
}

export function resetKey(def: ShortcutDef, prefs: ShortcutPrefs): ShortcutPrefs {
  const overrides = { ...prefs.overrides }
  delete overrides[def.id]
  return { ...prefs, overrides }
}

export function setSwitchedOff(
  def: ShortcutDef,
  off: boolean,
  prefs: ShortcutPrefs
): ShortcutPrefs {
  const disabled = prefs.disabled.filter((id) => id !== def.id)
  if (off) disabled.push(def.id)
  return { ...prefs, disabled }
}

export type MatchContext = {
  prefs: ShortcutPrefs
  /** The cursor is in a field. */
  typing: boolean
  /** A dialog, sheet or menu is open. */
  layerOpen: boolean
  /** Something can act on it now: a handler on this screen, or a page it opens. */
  available: (def: ShortcutDef) => boolean
}

/**
 * The shortcut a key press stands for right now, or null. The rules that keep
 * shortcuts out of the way live here: a key without Ctrl or Alt never fires
 * while typing, and nothing fires over a dialog unless it is meant to.
 */
/**
 * Whether a key press could be the first half of a sequence that would fire
 * right now: Alt+G, while the go-to set is on and no dialog is open.
 */
export function startsSequence(combo: Combo, ctx: MatchContext): boolean {
  if (!ctx.prefs.enabled || ctx.layerOpen) return false
  if (ctx.typing && !hasModifier(combo)) return false
  return SHORTCUTS.some(
    (def) =>
      ctx.available(def) && activeKeys(def, ctx.prefs).some((key) => key.startsWith(`${combo} `))
  )
}

export function matchShortcut(combos: readonly Combo[], ctx: MatchContext): ShortcutDef | null {
  if (!ctx.prefs.enabled) return null
  for (const combo of combos) {
    if (ctx.typing && !hasModifier(combo)) continue
    for (const def of SHORTCUTS) {
      if (ctx.layerOpen && !def.overLayers) continue
      if (!activeKeys(def, ctx.prefs).includes(combo)) continue
      if (!ctx.available(def)) continue
      return def
    }
  }
  return null
}
