'use client'

import { useCallback, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { FieldError } from '@/lib/field-errors'

/** The id of the line under a field that says what is wrong with it. */
export const fieldErrorId = (field: string) => `field-error-${field.replace(/[^\w-]/g, '-')}`

/**
 * A field error in words, in the language of whoever is signed in: "Can't be
 * negative.", "Use at most 200 characters.". A limit that is a year stays as
 * it is written; a large amount or count is grouped the way the person reads
 * numbers.
 */
export function useFieldErrorText() {
  const t = useTranslations('common.fieldErrors')
  const format = useFormatter()
  return useCallback(
    (error: Pick<FieldError, 'issue' | 'limit'>) => {
      const limit =
        error.limit == null
          ? ''
          : Math.abs(error.limit) >= 10_000
            ? format.number(error.limit)
            : String(error.limit)
      return t(error.issue, { limit })
    },
    [t, format]
  )
}

/** The form's control for a field, by name and then by id. */
function controlFor(form: HTMLFormElement, field: string): HTMLElement | null {
  const named = form.elements.namedItem(field)
  if (named instanceof HTMLElement) return named
  if (named && 'length' in named && named.length > 0) return named[0] as HTMLElement
  const byId = form.querySelector<HTMLElement>(`#${CSS.escape(field)}`)
  return byId
}

/**
 * The fields a server action refused, kept for the form that sent them, so
 * each can be marked where it is and said under it.
 *
 * `report` takes the action's `fieldErrors`, marks those the form has a
 * control for, focuses the first of them and hands back the rest, which the
 * form says some other way. Nothing typed is touched: the form stays open on
 * what was written. A field's mark goes when the field is changed (`clear`,
 * usually from the form's own onChange).
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, FieldError>>({})
  const text = useFieldErrorText()

  const report = useCallback(
    (form: HTMLFormElement | null, list: FieldError[] | undefined): FieldError[] => {
      if (!list?.length) return []
      if (!form) return list
      const marked: Record<string, FieldError> = {}
      const rest: FieldError[] = []
      const controls: HTMLElement[] = []
      for (const error of list) {
        const control = controlFor(form, error.field)
        if (control) {
          marked[error.field] = error
          controls.push(control)
        } else {
          rest.push(error)
        }
      }
      setErrors(marked)
      // The first in the order the form is read, not the order the schema checked.
      controls.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      )
      controls[0]?.focus()
      return rest
    },
    []
  )

  const clear = useCallback((field: string | null | undefined) => {
    if (!field) return
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const reset = useCallback(() => setErrors({}), [])

  /** aria-invalid and aria-describedby for a field's control, merged with what it already says. */
  const invalidProps = useCallback(
    (field: string, describedBy?: string) => {
      const error = errors[field]
      const ids = [describedBy, error ? fieldErrorId(field) : undefined].filter(Boolean).join(' ')
      return {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': ids || undefined,
      }
    },
    [errors]
  )

  /** The line under a field, or nothing when the field is fine. */
  const message = useCallback(
    (field: string) => {
      const error = errors[field]
      if (!error) return null
      return (
        <p id={fieldErrorId(field)} role="alert" className="text-xs text-destructive">
          {text(error)}
        </p>
      )
    },
    [errors, text]
  )

  return { errors, report, clear, reset, invalidProps, message, text }
}
