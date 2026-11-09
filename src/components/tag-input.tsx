'use client'

import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  cleanTag,
  normalizePartTags,
  sameTag,
  splitTagInput,
} from '@/features/inventory/Lib/partTags'

/** Suggestions listed at once; typing narrows the rest. */
const MAX_SUGGESTIONS = 50

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  /** Tags already in use elsewhere, offered while typing so one spelling sticks. */
  suggestions?: string[]
  id?: string
  /**
   * Name of the text box, so a form can read what was typed but not yet
   * turned into a tag when it is submitted.
   */
  name?: string
  placeholder?: string
  maxTags?: number
  maxLength?: number
  /** Accessible name of a tag's remove button. */
  removeLabel: (tag: string) => string
  className?: string
}

/**
 * A text box that turns what is typed into tags: Enter or a comma adds one,
 * Backspace in an empty box takes the last one off, and leaving the box keeps
 * whatever was typed. Tags the workshop already uses are suggested below.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  id,
  name,
  placeholder,
  maxTags,
  maxLength,
  removeLabel,
  className,
}: TagInputProps) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const full = maxTags !== undefined && value.length >= maxTags

  const matches = useMemo(() => {
    const typed = cleanTag(draft).toLocaleLowerCase()
    return suggestions
      .filter((tag) => !value.some((taken) => sameTag(taken, tag)))
      .filter((tag) => !typed || tag.toLocaleLowerCase().includes(typed))
      .slice(0, MAX_SUGGESTIONS)
  }, [draft, suggestions, value])

  const showList = open && !full && matches.length > 0

  const add = (tags: string[]) => {
    const next = normalizePartTags([...value, ...tags])
    const capped = maxTags !== undefined ? next.slice(0, maxTags) : next
    if (capped.length !== value.length) onChange(capped)
    setDraft('')
    setHighlighted(-1)
  }

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && matches.length > 0) {
      e.preventDefault()
      setOpen(true)
      setHighlighted((i) => (i + 1) % matches.length)
      return
    }
    if (e.key === 'ArrowUp' && matches.length > 0) {
      e.preventDefault()
      setOpen(true)
      setHighlighted((i) => (i <= 0 ? matches.length - 1 : i - 1))
      return
    }
    if (e.key === 'Enter' || e.key === ',') {
      const picked = showList && highlighted >= 0 ? matches[highlighted] : undefined
      // Enter in an empty box is left alone, so it still submits the form.
      if (!picked && !cleanTag(draft)) {
        if (e.key === ',') e.preventDefault()
        return
      }
      e.preventDefault()
      add(picked ? [picked] : splitTagInput(draft))
      return
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  const onDraftChange = (text: string) => {
    // A pasted list ("Toyota, Hilux, Corolla") becomes tags at its commas; the
    // text after the last comma stays in the box to be finished.
    if (/[,;\n]/.test(text)) {
      const parts = text.split(/[,;\n]/)
      const rest = parts.pop() ?? ''
      add(parts.flatMap(splitTagInput))
      setDraft(rest.trimStart())
    } else {
      setDraft(text)
      setHighlighted(-1)
    }
    setOpen(true)
  }

  return (
    <Popover
      open={showList}
      onOpenChange={(next) => {
        if (!next) setOpen(false)
      }}
    >
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className={cn(
            'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 shadow-xs transition-[color,box-shadow] dark:bg-input/30',
            'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
            className
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2 text-xs font-medium text-secondary-foreground"
            >
              <span className="truncate">{tag}</span>
              <button
                type="button"
                aria-label={removeLabel(tag)}
                title={removeLabel(tag)}
                className="rounded-sm p-0.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  remove(tag)
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {!full && (
            <input
              ref={inputRef}
              id={id}
              name={name}
              value={draft}
              maxLength={maxLength}
              placeholder={value.length === 0 ? placeholder : undefined}
              autoComplete="off"
              role="combobox"
              aria-expanded={showList}
              aria-autocomplete="list"
              className="h-7 min-w-24 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                if (cleanTag(draft)) add(splitTagInput(draft))
                setOpen(false)
              }}
            />
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="max-h-60 w-(--radix-popover-trigger-width) min-w-56 overflow-y-auto p-1"
        // The box keeps the focus: the list is read and picked from, never typed into.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
        }}
        // Not modal, unlike the app's other lists, because the focus has to
        // stay in the box. Inside a dialog its scroll lock would then swallow
        // the wheel, so the events stop here before they reach it.
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div role="listbox">
          {matches.map((tag, i) => (
            <button
              key={tag}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              className={cn(
                'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                i === highlighted && 'bg-accent'
              )}
              // mousedown, not click: a click would blur the box first and add
              // the half-typed text as a tag of its own.
              onMouseDown={(e) => {
                e.preventDefault()
                add([tag])
              }}
            >
              <span className="truncate">{tag}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
