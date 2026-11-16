'use client'

import { useGuardedPush } from '@/hooks/use-guarded-push'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useServiceType } from '@/components/service-type-context'
import {
  canAccessSubject,
  type CommandContext,
  visibleActionCommands,
  visiblePageCommands,
} from '@/features/search/Lib/commands'
import { saveKeyboardShortcuts } from '../Actions/saveKeyboardShortcuts'
import {
  type Combo,
  combosFromEvent,
  comboText,
  currentPlatform,
  detectPlatform,
  isLayerOpen,
  claimsPlainKeys,
  isLoneModifier,
  isCharacterKey,
  type Platform,
} from '../Lib/keys'
import {
  activeKeys,
  DEFAULT_SHORTCUT_PREFS,
  matchShortcut,
  startsSequence,
  normalizeShortcutPrefs,
  type ShortcutPrefs,
} from '../Lib/preferences'
import { type ShortcutDef, shortcutById } from '../Lib/registry'
import { ShortcutsHelpDialog } from './ShortcutsHelpDialog'

type Handler = () => void

/** How long the first key of a sequence waits for the second. */
const SEQUENCE_WINDOW_MS = 1500

/**
 * Characters closer together than this are a scanner, not a person. The
 * app's own scanner detection (hooks/use-hardware-scanner.ts) calls a scan
 * anything averaging under 80 ms a key; a person pressing G then W on
 * purpose is slower than 50 ms, and a scanner is a good deal faster.
 */
const SCANNER_BURST_MS = 50

/** After a key went into a field or a dialog, bare keys wait this long. */
const QUIET_AFTER_TYPING_MS = 500

type ShortcutsContextValue = {
  prefs: ShortcutPrefs
  /** For drawing key caps. 'other' until the browser has said what it is. */
  platform: Platform
  /** Applies at once and saves in the background; a failed save is undone. */
  updatePrefs: (next: ShortcutPrefs) => void
  /** This person may use it: their role, their plan and the modules that are on. */
  isVisible: (def: ShortcutDef) => boolean
  /** The settings page is theirs to open: it sits behind the settings gate. */
  canCustomize: boolean
  register: (id: string, handler: Handler) => () => void
  openHelp: () => void
  /** While the settings page records a key, nothing else answers the keyboard. */
  setRecording: (recording: boolean) => void
  isRecording: () => boolean
}

const noop = () => undefined

// Outside the provider (the designers, tests) everything is a default and
// nothing can be changed.
const ShortcutsContext = createContext<ShortcutsContextValue>({
  prefs: DEFAULT_SHORTCUT_PREFS,
  platform: 'other',
  updatePrefs: noop,
  isVisible: () => true,
  canCustomize: false,
  register: () => noop,
  openHelp: noop,
  setRecording: noop,
  isRecording: () => false,
})

export function useShortcuts() {
  return useContext(ShortcutsContext)
}

/**
 * The one keyboard listener of the signed-in app. Every shortcut in the
 * registry is matched here; a screen says what its shortcuts do with
 * `useShortcut`, and a shortcut that only opens a page needs no screen at all.
 */
export function ShortcutsProvider({
  initialPrefs,
  commands,
  plateLookupAvailable,
  children,
}: {
  /** User.keyboardShortcuts as stored. */
  initialPrefs: unknown
  /** What the search palette is told about this person, for the same reason. */
  commands: CommandContext
  plateLookupAvailable: boolean
  children: ReactNode
}) {
  const go = useGuardedPush()
  const t = useTranslations('settings.shortcuts')
  const [prefs, setPrefs] = useState(() => normalizeShortcutPrefs(initialPrefs))
  const [platform, setPlatform] = useState<Platform>('other')
  const [helpOpen, setHelpOpen] = useState(false)
  const handlers = useRef(new Map<string, Handler[]>())
  const recording = useRef(false)
  const pending = useRef<{ combo: Combo; at: number } | null>(null)
  const deferred = useRef<number | null>(null)
  const lastKeyAt = useRef(0)
  const lastClaimedAt = useRef(0)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(() => setPlatform(detectPlatform()), [])

  const visibleCommands = useMemo(
    () =>
      new Set([
        ...visiblePageCommands(commands).map((page) => page.id),
        ...visibleActionCommands(commands).map((action) => action.id),
      ]),
    [commands]
  )

  const isVisible = useCallback(
    (def: ShortcutDef) => {
      if (def.id === 'general.plateLookup') return plateLookupAvailable
      if (def.command) return visibleCommands.has(def.command)
      if (def.subject) return canAccessSubject(commands, def.subject)
      return true
    },
    [visibleCommands, commands, plateLookupAvailable]
  )

  const canCustomize = canAccessSubject(commands, 'settings')

  const register = useCallback((id: string, handler: Handler) => {
    const list = handlers.current.get(id) ?? []
    handlers.current.set(id, [...list, handler])
    return () => {
      const rest = (handlers.current.get(id) ?? []).filter((h) => h !== handler)
      if (rest.length > 0) handlers.current.set(id, rest)
      else handlers.current.delete(id)
    }
  }, [])

  // Saves run one after another, so a slow early one cannot land on top of a
  // later choice. A save that fails goes back to what the server last took,
  // and only when nothing newer is waiting: a later choice that is still on
  // its way stays on screen and settles itself.
  const saving = useRef<Promise<unknown>>(Promise.resolve())
  const saved = useRef(prefs)
  const latestSave = useRef(0)
  const updatePrefs = useCallback(
    (next: ShortcutPrefs) => {
      const ticket = ++latestSave.current
      setPrefs(next)
      saving.current = saving.current
        .then(() => saveKeyboardShortcuts(next))
        .then((result) => {
          if (!result.success) throw new Error(result.error)
          saved.current = next
        })
        .catch(() => {
          if (ticket === latestSave.current) setPrefs(saved.current)
          toast.error(t('saveFailed'))
        })
    },
    [t]
  )
  const openHelp = useCallback(() => setHelpOpen(true), [])

  useEffect(() => {
    const run = (def: ShortcutDef) => {
      const handler = handlers.current.get(def.id)?.at(-1)
      if (handler) {
        handler()
      } else if (def.href) {
        // Through the save guard, as a click on the sidebar is: an editor
        // with unsaved changes saves before the page is left.
        go(def.href)
      }
    }
    const forget = () => {
      pending.current = null
      if (deferred.current !== null) window.clearTimeout(deferred.current)
      deferred.current = null
    }

    const onKey = (e: KeyboardEvent) => {
      // Alt going down on its way to a chord is not a key press of its own:
      // Alt+G, let go, Alt+W is still one sequence.
      if (isLoneModifier(e)) return
      const now = Date.now()
      const sincePrevious = now - lastKeyAt.current
      if (!e.repeat) lastKeyAt.current = now
      // Whatever was waiting (the first key of a sequence, a letter held
      // back to see whether a scanner is typing) is settled by this key.
      const first = pending.current
      const wasDeferred = deferred.current !== null
      forget()

      // Alt+G held long enough to repeat is still one Alt+G.
      if (e.repeat && first && combosFromEvent(e, currentPlatform()).includes(first.combo)) {
        pending.current = first
        e.preventDefault()
        return
      }

      if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || recording.current) return
      const combos = combosFromEvent(e, currentPlatform())
      if (combos.length === 0) return

      // A bare key is a shortcut only when nothing else wants it: no field,
      // no list or menu that uses letters, no dialog or dropdown open, and
      // none of those in the last moment, so a sentence that outlives its
      // dialog or its field's focus does not turn into commands.
      const claimed = claimsPlainKeys(e)
      const layerOpen = isLayerOpen()
      if (claimed || layerOpen) lastClaimedAt.current = now
      const ctx = {
        prefs: prefsRef.current,
        typing: claimed || now - lastClaimedAt.current < QUIET_AFTER_TYPING_MS,
        layerOpen,
        available: (candidate: ShortcutDef) =>
          isVisible(candidate) && (handlers.current.has(candidate.id) || !!candidate.href),
      }

      const character = isCharacterKey(combos[0])
      // A barcode scanner types like a keyboard, only far faster than a
      // person, and often with no field focused. Characters that arrive in
      // such a burst are a scan, never a shortcut.
      const burst = character && !e.repeat && (sincePrevious < SCANNER_BURST_MS || wasDeferred)
      if (burst) return

      const sequence =
        first && !e.repeat && now - first.at < SEQUENCE_WINDOW_MS
          ? combos.map((combo) => `${first.combo} ${combo}`)
          : []
      const def = matchShortcut([...sequence, ...combos], ctx)
      if (!def) {
        const start = e.repeat ? undefined : combos.find((combo) => startsSequence(combo, ctx))
        if (start) {
          pending.current = { combo: start, at: now }
          e.preventDefault()
        }
        return
      }
      e.preventDefault()
      if (e.repeat) {
        // Holding the key down pages through the calendar; it should not
        // open the same dialog ten times.
        if (def.scope !== 'global') run(def)
        return
      }
      if (character) {
        // Held back for a moment: if more characters follow at once, it was
        // the start of a scan and the next key cancels it.
        deferred.current = window.setTimeout(() => {
          deferred.current = null
          run(def)
        }, SCANNER_BURST_MS)
        return
      }
      run(def)
    }
    // A click or a tap between two keys is a change of mind.
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', forget, true)
    window.addEventListener('blur', forget)
    return () => {
      forget()
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', forget, true)
      window.removeEventListener('blur', forget)
    }
  }, [isVisible, go])

  const value = useMemo<ShortcutsContextValue>(
    () => ({
      prefs,
      platform,
      updatePrefs,
      isVisible,
      canCustomize,
      register,
      openHelp,
      setRecording: (on) => {
        recording.current = on
      },
      isRecording: () => recording.current,
    }),
    [prefs, platform, updatePrefs, isVisible, canCustomize, register, openHelp]
  )

  return (
    <ShortcutsContext.Provider value={value}>
      <HelpShortcut onOpen={openHelp} />
      {children}
      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </ShortcutsContext.Provider>
  )
}

function HelpShortcut({ onOpen }: { onOpen: () => void }) {
  useShortcut('general.help', onOpen)
  return null
}

/**
 * Says what a shortcut does while this component is on screen. The newest
 * screen to claim a shortcut is the one that answers it.
 */
export function useShortcut(id: string, handler: Handler, enabled = true) {
  const { register } = useShortcuts()
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (!enabled) return
    return register(id, () => latest.current())
  }, [id, enabled, register])
}

/**
 * For the few listeners that must stay where they are in the DOM (saving,
 * which goes dialog first, then editor, then page): tells them whether a key
 * press is their shortcut, by the person's own keys.
 */
export function useShortcutMatcher(id: string): (e: KeyboardEvent) => boolean {
  const { prefs, isRecording } = useShortcuts()
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  return useCallback(
    (e: KeyboardEvent) => {
      const def = shortcutById(id)
      if (!def || isRecording()) return false
      const keys = activeKeys(def, prefsRef.current)
      return combosFromEvent(e, currentPlatform()).some((combo) => keys.includes(combo))
    },
    [id, isRecording]
  )
}

/** The key that fires a shortcut right now, with its words for a tooltip, or null. */
export function useShortcutKey(id: string): { combo: Combo; text: string } | null {
  const { prefs, platform, isVisible } = useShortcuts()
  const t = useTranslations('settings.shortcuts')
  const def = shortcutById(id)
  if (!def || !isVisible(def)) return null
  const combo = activeKeys(def, prefs)[0]
  if (!combo) return null
  return { combo, text: comboText(combo, platform, t('then')) }
}

/** Names a shortcut in the reader's language. */
export function useShortcutLabel(): (def: ShortcutDef) => string {
  const tShortcuts = useTranslations('settings.shortcuts.actions')
  const tSidebar = useTranslations('navigation.sidebar')
  const tSearch = useTranslations('search.actions')
  const marine = useServiceType() === 'marine'
  return useCallback(
    (def: ShortcutDef) => {
      const { label } = def
      if (label.from === 'sidebar') {
        return tSidebar(marine && label.marineKey ? label.marineKey : label.key)
      }
      if (label.from === 'search') return tSearch(label.key)
      return tShortcuts(label.key)
    },
    [tShortcuts, tSidebar, tSearch, marine]
  )
}
