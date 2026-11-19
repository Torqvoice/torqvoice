'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { AppCard } from '@/components/app-card'
import { Card, CardContent } from '@/components/ui/card'
import {
  getCustomFieldValues,
  saveValidatedCustomFieldValues,
  getFieldDefinitions,
  type CustomFieldError,
} from '@/features/custom-fields/Actions/customFieldActions'
import {
  CUSTOM_FIELD_VALUE_MAX_LENGTH,
  customFieldOptions,
  customFieldTypeIssue,
  isMissingRequiredValue,
  type CustomFieldIssue,
} from '@/features/custom-fields/Lib/customFieldValueRules'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FieldWithValue {
  id: string
  name: string
  label: string
  fieldType: string
  options: string | null
  required: boolean
  value: string
}

/**
 * What saving the custom fields came to. When it is not valid the fields at
 * fault are marked on the form, each with its own message, and the page is
 * handed what it needs to say why its save stopped: `fields` names them by
 * the workshop's own labels, `problem` tells a value left out from one that
 * does not fit its field, and `error` carries the server's own words when it
 * refused the whole save (a locked document, a missing permission).
 */
export type CustomFieldsSaveOutcome =
  | { valid: true }
  | { valid: false; problem?: 'required' | 'invalid'; fields?: string[]; error?: string }

/**
 * How a save was asked for. An autosave runs while the person is typing
 * somewhere else on the page, so it marks the fields but leaves the focus
 * and the scroll position alone; a save they asked for takes them to the
 * first field at fault.
 */
export type CustomFieldsSave = (options?: { reveal?: boolean }) => Promise<CustomFieldsSaveOutcome>

/**
 * A field at fault: the red border, and room kept under it when the browser
 * scrolls it into view (a phone does that as its keyboard opens), so the
 * message beneath the field comes into view with it.
 */
const INVALID_CLASS = 'border-destructive focus-visible:ring-destructive scroll-mb-10'

const ISSUE_MESSAGE = {
  required: 'requiredError',
  number: 'numberError',
  date: 'dateError',
  option: 'optionError',
  checkbox: 'checkboxError',
  tooLong: 'tooLongError',
} as const satisfies Record<CustomFieldIssue, string>

export function CustomFieldsForm({
  entityId,
  entityType,
  onValuesReady,
  onChange,
  locked = false,
}: {
  entityId?: string
  entityType: 'service_record' | 'quote'
  onValuesReady?: (save: CustomFieldsSave) => void
  onChange?: () => void
  /**
   * The document is locked and the fields are drawn read-only. Saving them is
   * then no step of the page's save at all: nothing can have changed, and a
   * required field left empty before the lock cannot be filled in now, so it
   * must not stand in the way of what the page still saves.
   */
  locked?: boolean
}) {
  const tSettings = useTranslations('settings.customFields')
  const [fields, setFields] = useState<FieldWithValue[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<Record<string, CustomFieldIssue>>({})
  // What the server holds for each field, as last loaded or saved. A value
  // left as it was is never re-checked for its type: see the save action.
  const savedValues = useRef<Record<string, string>>({})
  const card = useRef<HTMLDivElement>(null)
  // The field to take the person to, and a count so asking twice for the same
  // field (Save pressed again with nothing fixed) takes them there again.
  const [reveal, setReveal] = useState<{ fieldId: string; ask: number } | null>(null)

  useEffect(() => {
    if (!reveal) return
    const wrapper = Array.from(card.current?.children ?? []).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.dataset.testid === `custom-field-${reveal.fieldId}`
    )
    if (!wrapper) return
    const control = wrapper.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, button[role="combobox"]'
    )
    // Focus without the browser's own jump, then bring the message to the
    // middle of the screen: the field sits just above it, clear of a sticky
    // header above and of a phone's keyboard below.
    control?.focus({ preventScroll: true })
    const target = wrapper.querySelector<HTMLElement>('[role="alert"]') ?? wrapper
    target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [reveal])

  useEffect(() => {
    async function load() {
      setLoading(true)
      if (entityId) {
        const result = await getCustomFieldValues(entityId, entityType)
        if (result.success && result.data) {
          setFields(result.data)
          const v: Record<string, string> = {}
          for (const f of result.data) v[f.id] = f.value
          setValues(v)
          savedValues.current = v
        }
      } else {
        const result = await getFieldDefinitions(entityType)
        if (result.success && result.data) {
          setFields(
            result.data
              .filter((d) => d.isActive)
              .map((d) => ({ ...d, value: d.defaultValue ?? '' }))
          )
        }
      }
      setLoading(false)
    }
    load()
  }, [entityId, entityType])

  const validate = useCallback((): CustomFieldError[] => {
    const found: CustomFieldError[] = []
    for (const field of fields) {
      const val = values[field.id] ?? field.value ?? ''
      if (isMissingRequiredValue(field, val)) {
        found.push({ fieldId: field.id, label: field.label, issue: 'required' })
        continue
      }
      if (savedValues.current[field.id] === val) continue
      const issue = customFieldTypeIssue(field, val)
      if (issue) found.push({ fieldId: field.id, label: field.label, issue })
    }
    return found
  }, [fields, values])

  useEffect(() => {
    if (onValuesReady) {
      onValuesReady(async (options) => {
        if (locked) {
          setErrors({})
          return { valid: true }
        }
        const refused = (found: CustomFieldError[]): CustomFieldsSaveOutcome => {
          setErrors(Object.fromEntries(found.map((error) => [error.fieldId, error.issue])))
          if (options?.reveal !== false && found[0]) {
            const first = found[0].fieldId
            setReveal((last) => ({ fieldId: first, ask: (last?.ask ?? 0) + 1 }))
          }
          return {
            valid: false,
            problem: found.every((error) => error.issue === 'required') ? 'required' : 'invalid',
            fields: found.map((error) => error.label),
          }
        }

        const found = validate()
        if (found.length > 0) return refused(found)
        setErrors({})
        if (entityId && Object.keys(values).length > 0) {
          // The server checks the same rules again: it is the one that decides.
          const result = await saveValidatedCustomFieldValues(entityId, entityType, values)
          if (!result.success || !result.data) return { valid: false, error: result.error }
          if (!result.data.saved) {
            const { fieldErrors } = result.data
            // A field this form does not show: it was added, or made required,
            // while the form was open. Draw the fields as they are now, keeping
            // what was typed, so the message has a field to sit under.
            if (fieldErrors.some((error) => !fields.some((f) => f.id === error.fieldId))) {
              const fresh = await getCustomFieldValues(entityId, entityType)
              if (fresh.success && fresh.data) {
                const current = fresh.data
                setFields(current)
                setValues((typed) => {
                  const next = { ...typed }
                  for (const f of current) if (!(f.id in next)) next[f.id] = f.value
                  return next
                })
                for (const f of current) {
                  if (!(f.id in savedValues.current)) savedValues.current[f.id] = f.value
                }
              }
            }
            return refused(fieldErrors)
          }
          savedValues.current = { ...savedValues.current, ...values }
        }
        return { valid: true }
      })
    }
  }, [onValuesReady, entityId, entityType, fields, values, validate, locked])

  const updateValue = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
    // Clear error for field when user types
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    }
    onChange?.()
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (fields.length === 0) return null

  return (
    <AppCard title={tSettings('formTitle')} contentClassName="space-y-4">
      <div ref={card} className="space-y-4">
        {fields.map((field) => {
          const val = values[field.id] ?? field.value ?? ''
          const issue = errors[field.id]
          const hasError = !!issue
          const errorId = `custom-field-error-${field.id}`
          const inputId = `custom-field-input-${field.id}`
          const invalid = {
            id: inputId,
            'aria-invalid': hasError || undefined,
            'aria-describedby': hasError ? errorId : undefined,
          }
          return (
            <div key={field.id} data-testid={`custom-field-${field.id}`} className="space-y-1.5">
              {field.fieldType !== 'checkbox' && (
                <Label htmlFor={inputId} className={cn(hasError && 'text-destructive')}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
              )}

              {field.fieldType === 'text' && (
                <Input
                  value={val}
                  onChange={(e) => updateValue(field.id, e.target.value)}
                  className={cn(hasError && INVALID_CLASS)}
                  {...invalid}
                />
              )}

              {field.fieldType === 'number' && (
                <Input
                  type="number"
                  value={val}
                  onChange={(e) => updateValue(field.id, e.target.value)}
                  className={cn(hasError && INVALID_CLASS)}
                  {...invalid}
                />
              )}

              {field.fieldType === 'date' && (
                <DateInput
                  value={val}
                  onChange={(v) => updateValue(field.id, v)}
                  className={cn(hasError && INVALID_CLASS)}
                  {...invalid}
                />
              )}

              {field.fieldType === 'textarea' && (
                <Textarea
                  value={val}
                  onChange={(e) => updateValue(field.id, e.target.value)}
                  rows={3}
                  className={cn(hasError && INVALID_CLASS)}
                  {...invalid}
                />
              )}

              {field.fieldType === 'checkbox' && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={inputId}
                    checked={val === 'true'}
                    onCheckedChange={(checked) => updateValue(field.id, String(checked))}
                  />
                  <Label htmlFor={inputId}>{field.label}</Label>
                </div>
              )}

              {field.fieldType === 'select' && (
                <SearchableSelect
                  value={val || (field.required ? null : 'none')}
                  onValueChange={(v) => updateValue(field.id, v === 'none' ? '' : v)}
                  className={cn(hasError && 'scroll-mb-10')}
                  {...invalid}
                  options={[
                    ...(field.required
                      ? []
                      : [{ value: 'none', label: tSettings('defaultValueNone') }]),
                    ...customFieldOptions(field.options).map((option) => ({
                      value: option,
                      label: option,
                    })),
                  ]}
                />
              )}

              {issue && (
                <p id={errorId} role="alert" className="text-xs text-destructive">
                  {tSettings(ISSUE_MESSAGE[issue], {
                    label: field.label,
                    max: CUSTOM_FIELD_VALUE_MAX_LENGTH,
                  })}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </AppCard>
  )
}

/**
 * Returns the current custom field values as a Record<fieldId, value>.
 * Useful for saving after form submission.
 */
export function useCustomFieldValues() {
  const [values, setValues] = useState<Record<string, string>>({})
  return { values, setValues }
}
