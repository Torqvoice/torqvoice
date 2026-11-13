'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'

/**
 * What the customer wants done, one concern per row, the way a task list
 * takes items: type, Enter for the next, Backspace on an empty row to take
 * it away, and a pasted list becomes one row per line. Each row is one of
 * the job's concerns, printed under work requested on the work order.
 *
 * The list is kept as text, one concern per line, which is what the booking
 * actions take.
 */
export function ConcernListEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const t = useTranslations('calendar.appointment')
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const addRef = useRef<HTMLInputElement | null>(null)
  const items = value === '' ? [] : value.split('\n')

  const write = (next: string[]) => onChange(next.join('\n'))
  /** Focus a row once React has drawn it; one past the last is the add field. */
  const focusRow = (index: number) =>
    requestAnimationFrame(() => {
      const el = inputs.current[index] ?? addRef.current
      el?.focus()
    })

  const linesOf = (text: string) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

  const rowClass =
    'group flex h-9 items-center gap-2.5 rounded-md px-2 transition-colors focus-within:bg-accent/60 hover:bg-accent/60'

  return (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        // Rows are edited in place and have no id of their own; their
        // position is what they are.
        <div key={i} className={rowClass}>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums text-muted-foreground">
            {i + 1}
          </span>
          <input
            ref={(el) => {
              inputs.current[i] = el
            }}
            aria-label={t('concernLabel', { number: i + 1 })}
            value={item}
            disabled={disabled}
            maxLength={500}
            onChange={(e) => {
              const next = [...items]
              next[i] = e.target.value
              write(next)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const next = [...items]
                next.splice(i + 1, 0, '')
                write(next)
                focusRow(i + 1)
              } else if (e.key === 'Backspace' && item === '') {
                e.preventDefault()
                write(items.filter((_, j) => j !== i))
                focusRow(i > 0 ? i - 1 : items.length - 1)
              }
            }}
            onBlur={() => {
              // An emptied row goes when it is left, not while it is typed in.
              if (item.trim() === '') write(items.filter((_, j) => j !== i))
            }}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-70"
          />
          {!disabled && (
            <button
              type="button"
              aria-label={t('removeConcern')}
              onClick={() => write(items.filter((_, j) => j !== i))}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <div className={rowClass}>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
            <Plus className="h-3 w-3" />
          </span>
          <input
            ref={addRef}
            aria-label={t('addConcern')}
            placeholder={placeholder ?? t('addConcern')}
            onKeyDown={(e) => {
              const text = e.currentTarget.value.trim()
              if (e.key === 'Enter') {
                e.preventDefault()
                if (!text) return
                write([...items, text])
                e.currentTarget.value = ''
              } else if (e.key === 'Backspace' && !e.currentTarget.value && items.length > 0) {
                e.preventDefault()
                focusRow(items.length - 1)
              }
            }}
            onBlur={(e) => {
              // Typed and then clicked away from: still a concern.
              const text = e.currentTarget.value.trim()
              if (text) {
                write([...items, text])
                e.currentTarget.value = ''
              }
            }}
            onPaste={(e) => {
              const lines = linesOf(e.clipboardData.getData('text'))
              if (lines.length < 2) return
              e.preventDefault()
              write([...items, ...lines])
            }}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}
    </div>
  )
}
