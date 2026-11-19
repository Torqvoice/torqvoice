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
 * fault are marked on the form, and the page says why its save stopped:
 * `problem` tells a value left out from one that does not fit its field, and
 * `error` carries the server's own words when it refused the whole save (a
 * locked document, a missing permission).
 */
export type CustomFieldsSaveOutcome =
  | { valid: true }
  | { valid: false; problem?: 'required' | 'invalid'; error?: string }

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
}: {
  entityId?: string
  entityType: 'service_record' | 'quote'
  onValuesReady?: (save: () => Promise<CustomFieldsSaveOutcome>) => void
  onChange?: () => void
}) {
  const tSettings = useTranslations('settings.customFields')
  const [fields, setFields] = useState<FieldWithValue[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<Record<string, CustomFieldIssue>>({})
  // What the server holds for each field, as last loaded or saved. A value
  // left as it was is never re-checked for its type: see the save action.
  const savedValues = useRef<Record<string, string>>({})

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

  const validate = useCallback((): Record<string, CustomFieldIssue> => {
    const found: Record<string, CustomFieldIssue> = {}
    for (const field of fields) {
      const val = values[field.id] ?? field.value ?? ''
      if (isMissingRequiredValue(field, val)) {
        found[field.id] = 'required'
        continue
      }
      if (savedValues.current[field.id] === val) continue
      const issue = customFieldTypeIssue(field, val)
      if (issue) found[field.id] = issue
    }
    return found
  }, [fields, values])

  useEffect(() => {
    if (onValuesReady) {
      onValuesReady(async () => {
        const refused = (found: Record<string, CustomFieldIssue>): CustomFieldsSaveOutcome => {
          setErrors(found)
          const onlyMissing = Object.values(found).every((issue) => issue === 'required')
          return { valid: false, problem: onlyMissing ? 'required' : 'invalid' }
        }

        const found = validate()
        if (Object.keys(found).length > 0) return refused(found)
        setErrors({})
        if (entityId && Object.keys(values).length > 0) {
          // The server checks the same rules again: it is the one that decides.
          const result = await saveValidatedCustomFieldValues(entityId, entityType, values)
          if (!result.success || !result.data) return { valid: false, error: result.error }
          if (!result.data.saved) return refused(result.data.fieldErrors)
          savedValues.current = { ...savedValues.current, ...values }
        }
        return { valid: true }
      })
    }
  }, [onValuesReady, entityId, entityType, values, validate])

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
      {fields.map((field) => {
        const val = values[field.id] ?? field.value ?? ''
        const issue = errors[field.id]
        const hasError = !!issue
        const errorId = `custom-field-error-${field.id}`
        const invalid = {
          'aria-invalid': hasError || undefined,
          'aria-describedby': hasError ? errorId : undefined,
        }
        return (
          <div key={field.id} data-testid={`custom-field-${field.id}`} className="space-y-1.5">
            {field.fieldType !== 'checkbox' && (
              <Label className={cn(hasError && 'text-destructive')}>
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>
            )}

            {field.fieldType === 'text' && (
              <Input
                value={val}
                onChange={(e) => updateValue(field.id, e.target.value)}
                className={cn(hasError && 'border-destructive focus-visible:ring-destructive')}
                {...invalid}
              />
            )}

            {field.fieldType === 'number' && (
              <Input
                type="number"
                value={val}
                onChange={(e) => updateValue(field.id, e.target.value)}
                className={cn(hasError && 'border-destructive focus-visible:ring-destructive')}
                {...invalid}
              />
            )}

            {field.fieldType === 'date' && (
              <DateInput
                value={val}
                onChange={(v) => updateValue(field.id, v)}
                className={cn(hasError && 'border-destructive focus-visible:ring-destructive')}
              />
            )}

            {field.fieldType === 'textarea' && (
              <Textarea
                value={val}
                onChange={(e) => updateValue(field.id, e.target.value)}
                rows={3}
                className={cn(hasError && 'border-destructive focus-visible:ring-destructive')}
                {...invalid}
              />
            )}

            {field.fieldType === 'checkbox' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={val === 'true'}
                  onCheckedChange={(checked) => updateValue(field.id, String(checked))}
                />
                <Label>{field.label}</Label>
              </div>
            )}

            {field.fieldType === 'select' && (
              <SearchableSelect
                value={val || (field.required ? null : 'none')}
                onValueChange={(v) => updateValue(field.id, v === 'none' ? '' : v)}
                aria-invalid={hasError || undefined}
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
