'use client'

import { Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { splitByRanges } from '@/features/search/Lib/matcher'
import { useShortcutMatcher } from '@/features/shortcuts/Components/ShortcutsProvider'
import { claimsPlainKeys, comboText, detectPlatform } from '@/features/shortcuts/Lib/keys'
import {
  type DesignerSearchEntry,
  type DesignerSearchIndex,
  type DesignerSearchResult,
  searchDesigner,
} from '../Lib/designerSearch'

/** The groups of the list, each under its own caption. */
const GROUPS = ['fields', 'sections', 'styling'] as const
type GroupId = (typeof GROUPS)[number]

function groupOf(entry: DesignerSearchEntry): GroupId {
  if (entry.kind === 'section') return 'sections'
  if (entry.kind === 'styling') return 'styling'
  return 'fields'
}

/** The tag on a result: blue when it prints, amber when a setting is missing, grey otherwise. */
const STATE_TONE: Record<NonNullable<DesignerSearchEntry['state']>, string> = {
  shown: 'bg-[#eef2ff] text-[#2563eb]',
  off: 'bg-[#f4f5f7] text-[#71767e]',
  hiddenSection: 'bg-[#f4f5f7] text-[#71767e]',
  notPlaced: 'bg-[#f4f5f7] text-[#71767e]',
  needsSetting: 'bg-[#fef3c7] text-[#92400e]',
}

/**
 * The designer's search box, at the top of the section list. Typing lists
 * the sections and fields that match; choosing one is handed to the designer,
 * which opens the section and points the field out. The search itself changes
 * nothing on the sheet.
 */
export function DesignerSearch({
  index,
  onChoose,
}: {
  index: DesignerSearchIndex
  onChoose: (entry: DesignerSearchEntry) => void
}) {
  const t = useTranslations('settings.designer.search')
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  /** Where the keyboard was before the shortcut, to hand it back on Escape. */
  const returnTo = useRef<HTMLElement | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  /** The shortcut as this keyboard prints it. Known only in the browser. */
  const [shortcutText, setShortcutText] = useState('')
  const isSearchShortcut = useShortcutMatcher('general.search')

  useEffect(() => {
    setShortcutText(comboText('mod+k', detectPlatform()))
  }, [])

  // The app's search key, which has nothing else to open in here, and a bare
  // slash from anywhere that is not being typed into.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !claimsPlainKeys(e)
      if (!slash && !isSearchShortcut(e)) return
      // A dialog over the designer keeps its keys.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      e.preventDefault()
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused !== inputRef.current) {
        returnTo.current = focused
      }
      inputRef.current?.focus()
      inputRef.current?.select()
      setOpen(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isSearchShortcut])

  const results = useMemo(() => searchDesigner(index, query), [index, query])
  // Grouped for the eye, and walked by the arrows in the order they are drawn.
  const grouped = useMemo(() => {
    const order: GroupId[] = []
    const byGroup = new Map<GroupId, DesignerSearchResult[]>()
    for (const result of results) {
      const group = groupOf(result.entry)
      if (!byGroup.has(group)) {
        byGroup.set(group, [])
        order.push(group)
      }
      byGroup.get(group)?.push(result)
    }
    return order.map((group) => ({ group, results: byGroup.get(group) ?? [] }))
  }, [results])
  const flat = useMemo(() => grouped.flatMap((g) => g.results), [grouped])
  const typed = query.trim().length > 0
  const showing = open && typed
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0))

  const close = (handBack: boolean) => {
    setOpen(false)
    setQuery('')
    setActive(0)
    if (handBack) {
      const target = returnTo.current
      if (target?.isConnected) target.focus()
      else inputRef.current?.blur()
    }
    returnTo.current = null
  }

  const choose = (entry: DesignerSearchEntry) => {
    close(false)
    onChoose(entry)
  }

  const optionId = (i: number) => `${listId}-option-${i}`

  return (
    <div
      className="relative px-2 pt-2.5"
      onBlur={(e) => {
        // Focus left the box and its list: the list goes, the words stay.
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <div className="flex h-[34px] items-center gap-[7px] rounded-[7px] border border-[#e3e5e9] bg-white px-2 text-[#71767e] focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/25">
        <Search size={14} className="shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={t('label')}
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showing && flat.length > 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          data-testid="designer-search"
          value={query}
          placeholder={t('placeholder')}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              close(true)
              return
            }
            if (!showing || flat.length === 0) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((activeIndex + 1) % flat.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((activeIndex - 1 + flat.length) % flat.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(flat[activeIndex].entry)
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1a1d21] outline-none placeholder:text-[#71767e]"
        />
        {typed ? (
          <button
            type="button"
            aria-label={t('clear')}
            title={t('clear')}
            onClick={() => {
              setQuery('')
              setActive(0)
              inputRef.current?.focus()
            }}
            className="shrink-0 rounded text-[#71767e] outline-none hover:text-[#1a1d21] focus-visible:ring-2 focus-visible:ring-[#2563eb]"
          >
            <X size={14} />
          </button>
        ) : (
          shortcutText && (
            <kbd
              aria-hidden
              className="shrink-0 rounded border border-[#e3e5e9] bg-[#f7f8fa] px-[5px] py-[3px] font-sans text-[11px] font-medium leading-none text-[#71767e]"
            >
              {shortcutText}
            </kbd>
          )
        )}
      </div>

      {/* Said aloud as the list changes; the list itself is read by the arrows. */}
      <div aria-live="polite" className="sr-only">
        {showing ? (flat.length > 0 ? t('count', { count: flat.length }) : t('emptySpoken')) : ''}
      </div>

      <div
        id={listId}
        role="listbox"
        aria-label={t('results')}
        hidden={!showing}
        // Wider than the rail, over the canvas: a result names the field and
        // where it lives, which the rail's width cannot hold.
        className="absolute left-2 top-[48px] z-30 w-[400px] rounded-[10px] border border-[#e3e5e9] bg-white p-1.5 shadow-[0_12px_32px_rgba(26,29,33,0.16),0_2px_6px_rgba(26,29,33,0.08)]"
        // Keeps the keyboard in the box while the mouse picks a row.
        onMouseDown={(e) => e.preventDefault()}
      >
        {showing && flat.length === 0 && (
          <div className="px-3.5 pb-5 pt-[22px] text-center" data-testid="designer-search-empty">
            <div className="text-[13.5px] font-semibold text-[#1a1d21]">
              {t('emptyTitle', { query: query.trim() })}
            </div>
            <div className="mt-1 text-[12.5px] leading-snug text-[#71767e]">{t('emptyHint')}</div>
          </div>
        )}
        {showing &&
          grouped.map(({ group, results: rows }) => (
            <div key={group} role="group" aria-label={t(`groups.${group}`)}>
              <div
                aria-hidden
                className="px-2 pb-[5px] pt-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#71767e]"
              >
                {t(`groups.${group}`)}
              </div>
              {rows.map(({ entry, match }) => {
                const i = flat.findIndex((r) => r.entry.key === entry.key)
                const isActive = i === activeIndex
                const line =
                  entry.state === 'needsSetting'
                    ? t('needsSettingLine', { section: entry.context })
                    : entry.context
                return (
                  <div
                    key={entry.key}
                    id={optionId(i)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={isActive}
                    data-testid={`designer-search-result-${entry.key}`}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(entry)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2 py-[7px]"
                    style={{ background: isActive ? '#eef2ff' : undefined }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-[#1a1d21]">
                        {splitByRanges(entry.title, match.ranges).map((part, at) =>
                          part.hit ? (
                            <b key={at} className="font-bold text-[#2563eb]">
                              {part.text}
                            </b>
                          ) : (
                            <span key={at}>{part.text}</span>
                          )
                        )}
                      </div>
                      {line && (
                        <div
                          className="mt-px truncate text-[12px]"
                          style={{ color: entry.state === 'needsSetting' ? '#92400e' : '#71767e' }}
                        >
                          {line}
                        </div>
                      )}
                    </div>
                    {entry.state && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${STATE_TONE[entry.state]}`}
                      >
                        {t(`state.${entry.state}`)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        {showing && flat.length > 0 && (
          <div
            aria-hidden
            className="-mx-1.5 -mb-1.5 mt-1.5 flex gap-3.5 border-t border-[#eceef1] px-3.5 py-2 text-[11.5px] text-[#71767e]"
          >
            {(
              [
                ['↑ ↓', 'move'],
                ['↵', 'go'],
                ['Esc', 'close'],
              ] as const
            ).map(([key, label]) => (
              <span key={label}>
                <kbd className="mr-1 rounded border border-[#e3e5e9] bg-[#f7f8fa] px-1 py-0.5 font-sans text-[10.5px] font-medium leading-none">
                  {key}
                </kbd>
                {t(`keys.${label}`)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
