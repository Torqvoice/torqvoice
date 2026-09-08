'use client'

import type { Editor } from '@tiptap/react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { type EmailTag, TAG_GROUPS, TAGS, tagsInGroup } from '../Lib/tags'

type TagInput = HTMLInputElement | HTMLTextAreaElement

/**
 * Somewhere a tag can be written: a plain input or textarea the picker
 * splices the token into, or a Tiptap editor that inserts it at its own
 * cursor.
 */
export type TagTarget =
  | { kind: 'field'; element: TagInput; setValue: (value: string) => void }
  | { kind: 'editor'; editor: Editor }

/**
 * Where a picked tag goes.
 *
 * Every text field in the inspector registers itself and says when it is
 * focused; the picker writes into the one focused last, at its cursor, and
 * into the first field when none has been touched yet. One picker for the
 * whole panel rather than one per field, because a template with a subject
 * and four paragraphs would otherwise show the same forty chips five times.
 */
export function useTagTargets() {
  const targets = useRef(new Map<string, TagTarget>())
  const [focused, setFocused] = useState<string | null>(null)

  const register = useCallback((id: string, target: TagTarget | null) => {
    if (target) targets.current.set(id, target)
    else targets.current.delete(id)
  }, [])

  const insert = useCallback(
    (tag: EmailTag) => {
      const id =
        focused && targets.current.has(focused) ? focused : targets.current.keys().next().value
      const target = id ? targets.current.get(id) : undefined
      if (!target) return
      const token = `{${tag}}`
      if (target.kind === 'editor') {
        target.editor.chain().focus().insertContent({ type: 'text', text: token }).run()
        return
      }
      const el = target.element
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? start
      target.setValue(el.value.slice(0, start) + token + el.value.slice(end))
      // React writes the new value on the next render; the cursor goes after
      // the tag once it has.
      requestAnimationFrame(() => {
        el.focus()
        const at = start + token.length
        el.setSelectionRange(at, at)
      })
    },
    [focused]
  )

  return { register, setFocused, insert }
}

export type TagTargets = ReturnType<typeof useTagTargets>

/**
 * A text field the picker can write into. Multiline for prose, a single
 * line for a subject or a button label.
 */
export function TagField({
  id,
  label,
  value,
  onChange,
  targets,
  multiline = false,
  rows = 5,
  maxLength,
  placeholder,
  mono = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  targets: TagTargets
  multiline?: boolean
  rows?: number
  maxLength?: number
  placeholder?: string
  mono?: boolean
}) {
  const element = useRef<TagInput>(null)
  const latest = useRef(onChange)
  latest.current = onChange

  useEffect(() => {
    const el = element.current
    if (!el) return
    targets.register(id, { kind: 'field', element: el, setValue: (next) => latest.current(next) })
    return () => targets.register(id, null)
  }, [id, targets])

  const className = cn('leading-relaxed', mono && 'font-mono text-xs md:text-xs')

  return (
    <div>
      <label
        htmlFor={`tag-field-${id}`}
        className="mb-1 block text-[13px] font-medium text-foreground"
      >
        {label}
      </label>
      {multiline ? (
        <Textarea
          id={`tag-field-${id}`}
          ref={(el) => {
            element.current = el
          }}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => targets.setFocused(id)}
          className={cn(className, 'resize-y')}
        />
      ) : (
        <Input
          id={`tag-field-${id}`}
          ref={(el) => {
            element.current = el
          }}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => targets.setFocused(id)}
          className={cn(className, 'h-8')}
        />
      )}
    </div>
  )
}

/**
 * The tags this kind of mail can say, as chips grouped the way the registry
 * groups them. A chip's tooltip says what it fills with; a dotted chip is a
 * tag not every send has a value for, so the sentence around it has to
 * survive it being blank.
 */
export function TagPicker({
  tags,
  onInsert,
}: {
  tags: readonly EmailTag[]
  onInsert: (tag: EmailTag) => void
}) {
  const t = useTranslations('settings.emailTemplates')
  const offered = new Set(tags)

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-2.5">
        {TAG_GROUPS.map((group) => {
          const inGroup = tagsInGroup(group).filter((tag) => offered.has(tag))
          if (inGroup.length === 0) return null
          return (
            <div key={group}>
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                {t(`tagGroups.${group}`)}
              </div>
              <div className="flex flex-wrap gap-1">
                {inGroup.map((tag) => {
                  const optional = 'optional' in TAGS[tag] && TAGS[tag].optional === true
                  return (
                    <Tooltip key={tag}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          // Mouse down would move focus off the field the
                          // tag is meant for; the click still fires.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onInsert(tag)}
                          className={cn(
                            'rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring',
                            optional ? 'border-dashed border-muted-foreground/40' : 'border-border'
                          )}
                        >
                          {`{${tag}}`}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        <div className="font-medium">{t(`tags.${tag}.label`)}</div>
                        <div className="opacity-80">{t(`tags.${tag}.description`)}</div>
                        {optional && <div className="mt-1 opacity-80">{t('optionalTag')}</div>}
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
