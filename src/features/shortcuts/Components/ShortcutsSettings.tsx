'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Command, Keyboard, RotateCcw, TriangleAlert } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { useConfirm } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { type Combo, comboFromEvent, comboParts, comboText, currentPlatform } from '../Lib/keys'
import {
  activeKeys,
  assignedKeys,
  assignKey,
  type ComboProblem,
  comboProblem,
  findClash,
  isChanged,
  isSwitchedOff,
  resetKey,
  setSwitchedOff,
} from '../Lib/preferences'
import { SHORTCUT_GROUPS, SHORTCUTS, type ShortcutDef, shortcutById } from '../Lib/registry'
import { ComboCaps } from './ShortcutKeys'
import { useShortcutLabel, useShortcuts } from './ShortcutsProvider'

const CAP = 'h-6 min-w-6 px-1.5 text-xs text-foreground'

/** What recording a key ran into, shown under the row until it is settled. */
type Notice =
  | { id: string; kind: 'clash'; combo: Combo; other: ShortcutDef }
  | { id: string; kind: 'problem'; combo: Combo; problem: ComboProblem }

/**
 * Settings, Keyboard shortcuts: one person's own keys. Every change is saved
 * as it is made, so there is no Save button to forget.
 */
export function ShortcutsSettings() {
  const t = useTranslations('settings.shortcuts')
  const { prefs, platform, updatePrefs, isVisible, setRecording } = useShortcuts()
  const labelOf = useShortcutLabel()
  const confirm = useConfirm()
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const recorder = useRef<HTMLButtonElement>(null)

  const keysText = (combo: Combo) => comboText(combo, platform, t('then'))
  const searchCombo = activeKeys(shortcutById('general.search') as ShortcutDef, prefs)[0]
  const searchKeys = searchCombo
    ? keysText(searchCombo)
    : labelOf(shortcutById('general.search') as ShortcutDef)
  // The go-to set in this person's own key names: Alt+G on Windows, ⌃ G on a Mac.
  const goToWords = {
    prefix: comboText('alt+g', platform),
    example: keysText('alt+g alt+w'),
    workOrders: labelOf(shortcutById('goTo.workOrders') as ShortcutDef),
  }
  const modifierNames = {
    mod: comboParts('mod+a', platform)[0],
    alt: comboParts('alt+a', platform)[0],
  }

  // The app's listener stands down while a key is being recorded, or the key
  // being chosen would also do whatever it does today.
  useEffect(() => {
    setRecording(recordingId !== null)
    if (recordingId) recorder.current?.focus()
    return () => setRecording(false)
  }, [recordingId, setRecording])

  const focusChange = (id: string) => {
    window.setTimeout(() => document.getElementById(`shortcut-change-${id}`)?.focus(), 0)
  }

  const stopRecording = (id: string) => {
    setRecordingId(null)
    focusChange(id)
  }

  const apply = (def: ShortcutDef, combo: Combo) => {
    updatePrefs(assignKey(def, combo, prefs))
    setNotice(null)
    setAnnouncement(t('announceSet', { action: labelOf(def), keys: keysText(combo) }))
  }

  const onRecordKey = (def: ShortcutDef, e: React.KeyboardEvent) => {
    // Tab leaves the recorder, which cancels: nobody is trapped in it.
    if (e.key === 'Tab') return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      setNotice(null)
      stopRecording(def.id)
      return
    }
    const combo = comboFromEvent(e.nativeEvent, currentPlatform())
    if (!combo) return
    const problem = comboProblem(def, combo)
    if (problem) {
      setNotice({ id: def.id, kind: 'problem', combo, problem })
      return
    }
    if (assignedKeys(def, prefs).length === 1 && assignedKeys(def, prefs)[0] === combo) {
      setNotice(null)
      stopRecording(def.id)
      return
    }
    const other = findClash(def, combo, prefs, isVisible)
    if (other) {
      setNotice({ id: def.id, kind: 'clash', combo, other })
      setRecordingId(null)
      return
    }
    apply(def, combo)
    stopRecording(def.id)
  }

  const resetAll = async () => {
    const ok = await confirm({
      title: t('resetAllTitle'),
      description: t('resetAllDescription'),
      confirmLabel: t('resetAll'),
    })
    if (!ok) return
    setNotice(null)
    updatePrefs({ ...prefs, overrides: {}, disabled: [] })
    setAnnouncement(t('announceResetAll'))
  }

  const anythingChanged = Object.keys(prefs.overrides).length > 0 || prefs.disabled.length > 0

  const renderRow = (def: ShortcutDef) => {
    const label = labelOf(def)
    const keys = assignedKeys(def, prefs)
    const off = isSwitchedOff(def, prefs)
    const changed = isChanged(def, prefs)
    const recording = recordingId === def.id
    const rowNotice = notice?.id === def.id ? notice : null
    // Its own key, then the ones that come with it and cannot be changed here:
    // the arrows, and its place in "G then a letter" while that set is on.
    const shown = [
      ...keys,
      ...(def.fixedKeys ?? []),
      ...(def.sequence && prefs.goToSequences ? [def.sequence] : []),
    ]
    const duplicate = keys
      .map((combo) => findClash(def, combo, prefs, isVisible))
      .find((other) => other !== null)

    return (
      <li
        key={def.id}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-2.5 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
      >
        <div className={cn('min-w-0 text-sm', off && 'text-muted-foreground')}>
          <span>{label}</span>
          {changed && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {t('changed')}
            </span>
          )}
          {off && <span className="block text-xs">{t('off')}</span>}
        </div>

        <div className="col-start-1 row-start-2 flex min-h-8 items-center gap-1.5 md:col-start-2 md:row-start-1 md:justify-end">
          {recording ? (
            <button
              ref={recorder}
              type="button"
              aria-label={t('recordingFor', { action: label })}
              onKeyDown={(e) => onRecordKey(def, e)}
              onBlur={() => setRecordingId((current) => (current === def.id ? null : current))}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-dashed border-primary bg-primary/5 px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft"
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse"
              />
              {t('pressKeys')}
            </button>
          ) : shown.length === 0 ? (
            <span className="text-xs text-muted-foreground">{t('noKey')}</span>
          ) : (
            <span className={cn('flex flex-wrap items-center gap-1.5', off && 'opacity-50')}>
              {shown.map((combo, index) => (
                <Fragment key={combo}>
                  {index > 0 && <span className="text-xs text-muted-foreground">{t('or')}</span>}
                  <ComboCaps combo={combo} capClassName={CAP} />
                </Fragment>
              ))}
            </span>
          )}
        </div>

        <div className="col-start-2 row-start-2 flex items-center justify-end gap-1 md:col-start-3 md:row-start-1">
          {recording ? (
            // Pressed with the mouse: the recorder's blur has already cancelled.
            <Button type="button" variant="outline" size="sm" onClick={() => setNotice(null)}>
              {t('cancel')}
            </Button>
          ) : (
            <>
              {changed && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('resetFor', { action: label })}
                  title={
                    def.defaultKeys.length > 0
                      ? t('resetTo', { keys: def.defaultKeys.map(keysText).join(', ') })
                      : t('resetToNone')
                  }
                  onClick={() => {
                    setNotice(null)
                    updatePrefs(resetKey(def, prefs))
                    setAnnouncement(t('announceReset', { action: label }))
                  }}
                >
                  <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                  {t('reset')}
                </Button>
              )}
              <Button
                id={`shortcut-change-${def.id}`}
                type="button"
                variant="outline"
                size="sm"
                aria-label={t('changeFor', { action: label })}
                onClick={() => {
                  setNotice(null)
                  setRecordingId(def.id)
                }}
              >
                {t('change')}
              </Button>
            </>
          )}
        </div>

        <Switch
          className="col-start-2 row-start-1 justify-self-end md:col-start-4"
          checked={!off}
          disabled={!prefs.enabled}
          aria-label={t('switchFor', { action: label })}
          onCheckedChange={(on) => updatePrefs(setSwitchedOff(def, !on, prefs))}
        />

        {rowNotice?.kind === 'clash' && (
          <div
            role="alert"
            // A row near the bottom of the window would otherwise ask its
            // question out of sight.
            ref={(el) => {
              el?.scrollIntoView?.({ block: 'nearest' })
            }}
            className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm"
          >
            <TriangleAlert aria-hidden className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-48 flex-1">
              {t('clash', { keys: keysText(rowNotice.combo), action: labelOf(rowNotice.other) })}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                apply(def, rowNotice.combo)
                focusChange(def.id)
              }}
            >
              {t('useHere')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setNotice(null)
                setRecordingId(def.id)
              }}
            >
              {t('pickAnother')}
            </Button>
          </div>
        )}
        {rowNotice?.kind === 'problem' && (
          <p role="alert" className="col-span-full text-sm text-destructive">
            {t(`problems.${rowNotice.problem}`, {
              keys: keysText(rowNotice.combo),
              ...modifierNames,
            })}
          </p>
        )}
        {!rowNotice && duplicate && (
          <p className="col-span-full text-xs text-muted-foreground">
            {t('alsoUsedBy', { action: labelOf(duplicate) })}
          </p>
        )}
      </li>
    )
  }

  return (
    // `relative` is load-bearing. The announcement below is visually hidden,
    // which means absolutely positioned; with no positioned ancestor it is
    // laid out against the page instead of this pane, far below the window,
    // and the whole document starts to scroll.
    <div className="relative space-y-6" data-testid="shortcuts-settings">
      <p aria-live="polite" className="sr-only top-0 left-0">
        {announcement}
      </p>
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground md:hidden">
        {t('phoneNote')}
      </p>

      <AppCard
        id="shortcuts-general"
        icon={Keyboard}
        title={t('title')}
        description={t('description')}
        contentClassName="p-0"
      >
        <div className="divide-y">
          <label className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="min-w-0 text-sm">
              <span id="shortcuts-enabled-label">{t('enableLabel')}</span>
              <span className="block text-xs text-muted-foreground">{t('enableHint')}</span>
            </span>
            <Switch
              id="shortcuts-enabled"
              aria-labelledby="shortcuts-enabled-label"
              checked={prefs.enabled}
              onCheckedChange={(enabled) => updatePrefs({ ...prefs, enabled })}
            />
          </label>
          <label className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="min-w-0 text-sm">
              <span id="shortcuts-single-label">{t('singleKeysLabel')}</span>
              <span className="block text-xs text-muted-foreground">{t('singleKeysHint')}</span>
            </span>
            <Switch
              id="shortcuts-single-keys"
              aria-labelledby="shortcuts-single-label"
              checked={prefs.singleKeys}
              disabled={!prefs.enabled}
              onCheckedChange={(singleKeys) => updatePrefs({ ...prefs, singleKeys })}
            />
          </label>
          <label className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="min-w-0 text-sm">
              <span id="shortcuts-sequences-label">{t('goToSequencesLabel', goToWords)}</span>
              <span className="block text-xs text-muted-foreground">
                {t('goToSequencesHint', goToWords)}
              </span>
            </span>
            <Switch
              id="shortcuts-go-to-sequences"
              aria-labelledby="shortcuts-sequences-label"
              checked={prefs.goToSequences}
              disabled={!prefs.enabled}
              onCheckedChange={(goToSequences) => updatePrefs({ ...prefs, goToSequences })}
            />
          </label>
        </div>
      </AppCard>

      <AppCard
        id="shortcuts-all"
        icon={Command}
        title={t('allTitle')}
        description={t('allHint')}
        contentClassName="p-0"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!anythingChanged}
            onClick={resetAll}
          >
            {t('resetAll')}
          </Button>
        }
      >
        {SHORTCUT_GROUPS.map((group) => {
          const defs = SHORTCUTS.filter((def) => def.group === group && isVisible(def))
          if (defs.length === 0) return null
          return (
            <section key={group} aria-labelledby={`shortcuts-group-${group}`}>
              <div className="flex items-baseline justify-between gap-3 border-y bg-muted/60 px-5 py-2 first:border-t-0">
                <h3
                  id={`shortcuts-group-${group}`}
                  className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {t(`groups.${group}`)}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {t(group === 'calendar' ? 'scopes.calendar' : 'scopes.global')}
                </span>
              </div>
              {group === 'goTo' && (
                <p className="border-b px-5 py-2 text-xs text-muted-foreground">
                  {t('goToNote', { keys: searchKeys, ...goToWords })}
                </p>
              )}
              <ul className={cn('divide-y', !prefs.enabled && 'opacity-60')}>
                {defs.map(renderRow)}
              </ul>
            </section>
          )
        })}
      </AppCard>
    </div>
  )
}
