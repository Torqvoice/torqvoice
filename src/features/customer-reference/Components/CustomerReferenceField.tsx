'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { CUSTOMER_REFERENCE_MAX_LENGTH, normalizeCustomerReference } from '../Lib/reference'

interface CustomerReferenceFieldProps {
  /** What the row holds now. */
  value: string | null
  /** Writes it. Called a moment after typing stops, and when the field is left. */
  onSave: (reference: string) => Promise<{ success: boolean; error?: string }>
  /** After a save went through: the page shows its "Saved" mark and re-reads. */
  onSaved?: (reference: string | null) => void
  /** Told on every keystroke, so a notice elsewhere can follow the box. */
  onValueChange?: (reference: string) => void
  /** This customer's invoices need it: the empty box says so. */
  required?: boolean
  /** Label beside the box (the work order's facts card) or above it (the quote's side column). */
  layout?: 'inline' | 'stacked'
  labelClassName?: string
  id?: string
}

/**
 * The customer's reference / PO number on a work order or a quote.
 *
 * It saves on its own rather than with the page's form: the number often
 * arrives after the invoice has been sent and locked, and it has to be
 * typed in then all the same. Only drawn by a workshop that has the field
 * switched on; the caller asks useCustomerReferenceEnabled.
 */
export function CustomerReferenceField({
  value,
  onSave,
  onSaved,
  onValueChange,
  required = false,
  layout = 'inline',
  labelClassName,
  id = 'customerReference',
}: CustomerReferenceFieldProps) {
  const t = useTranslations('service.reference')
  const [text, setText] = useState(value ?? '')
  // What the server last confirmed, so a blur with nothing changed saves nothing.
  const savedRef = useRef(normalizeCustomerReference(value))
  const textRef = useRef(text)
  textRef.current = text
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  // A tick in the box for a moment after a save: the field saves on its own,
  // so it says so on its own, whatever page it is on.
  const [justSaved, setJustSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (savedTimer.current && clearTimeout(savedTimer.current)), [])

  // The row changed underneath (a refresh after someone else's edit): follow
  // it, unless this box holds something not yet saved.
  useEffect(() => {
    const incoming = normalizeCustomerReference(value)
    if (normalizeCustomerReference(textRef.current) === savedRef.current) {
      setText(incoming ?? '')
    }
    savedRef.current = incoming
  }, [value])

  const save = async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const next = normalizeCustomerReference(textRef.current)
    if (next === savedRef.current) return
    const previous = savedRef.current
    savedRef.current = next
    const result = await onSaveRef.current(next ?? '')
    if (result.success) {
      setJustSaved(true)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setJustSaved(false), 2000)
      onSaved?.(next)
    } else {
      savedRef.current = previous
      toast.error(result.error || t('saveFailed'))
    }
  }
  const saveRef = useRef(save)
  saveRef.current = save

  // Leaving the page mid-word still saves what was typed.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        void saveRef.current()
      }
    }
  }, [])

  const missing = required && !text.trim()

  return (
    // The pages this sits on save their own form whenever something inside it
    // is typed in. This box is not theirs to save, so its typing stops here.
    <div
      className="space-y-1"
      data-testid="customer-reference"
      onInput={(e) => e.stopPropagation()}
    >
      <div className={cn(layout === 'inline' ? 'flex items-center gap-2' : 'space-y-1')}>
        <Label htmlFor={id} className={cn('shrink-0', labelClassName)}>
          {t('label')}
        </Label>
        <div className={cn('relative min-w-0', layout === 'inline' && 'w-full max-w-56')}>
          <Input
            id={id}
            // No name: the field is not part of the form around it, which saves
            // by reading its named inputs.
            value={text}
            maxLength={CUSTOMER_REFERENCE_MAX_LENGTH}
            autoComplete="off"
            placeholder={t('placeholder')}
            aria-required={required || undefined}
            aria-describedby={missing ? `${id}-required` : undefined}
            className={cn(
              'h-8 w-full min-w-0',
              justSaved && 'pr-8',
              missing && 'border-amber-500/70 focus-visible:ring-amber-500/40'
            )}
            onChange={(e) => {
              setText(e.target.value)
              textRef.current = e.target.value
              onValueChange?.(e.target.value)
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(() => void saveRef.current(), 800)
            }}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              // Enter saves the number; it must not submit the form around it.
              if (e.key === 'Enter') {
                e.preventDefault()
                void save()
              }
            }}
          />
          {justSaved && (
            <span
              role="status"
              className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-emerald-600 dark:text-emerald-500"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t('saved')}</span>
            </span>
          )}
        </div>
      </div>
      {missing && (
        <p
          id={`${id}-required`}
          role="status"
          data-testid="customer-reference-required"
          className="text-xs font-medium text-amber-700 dark:text-amber-400"
        >
          {t('requiredNotice')}
        </p>
      )}
    </div>
  )
}
