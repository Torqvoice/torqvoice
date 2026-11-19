'use client'

import { useRef } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useServiceType } from '@/components/service-type-context'

interface ReadingConfirmDialogProps {
  /** The reading being saved, or null while nothing is asked. */
  entered: number | null
  /** The last known reading it is far above. */
  last: number
  /** "km" or "mi", where the caller knows it. */
  unit?: string
  onConfirm: () => void
  /** Closed without a yes: nothing is saved. */
  onChange: () => void
  /** Puts the person back in the reading field, once the dialog has let go of the focus. */
  focusField: () => void
}

/**
 * Asked on Save when a reading is far above the last one (readingNeedsAnswer):
 * yes saves it, "Change it" goes back to the field with nothing saved.
 */
export function ReadingConfirmDialog({
  entered,
  last,
  unit,
  onConfirm,
  onChange,
  focusField,
}: ReadingConfirmDialogProps) {
  const t = useTranslations('vehicles.form')
  const format = useFormatter()
  const isMarine = useServiceType() === 'marine'
  // Closing by Yes is an answer; closing any other way (Change it, Escape,
  // a click outside) goes back to the field.
  const confirmed = useRef(false)
  const backToField = useRef(false)
  const withUnit = (value: number) =>
    unit && !isMarine ? `${format.number(value)} ${unit}` : format.number(value)
  return (
    <AlertDialog
      open={entered != null}
      onOpenChange={(open) => {
        if (open) return
        backToField.current = !confirmed.current
        if (!confirmed.current) onChange()
        confirmed.current = false
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (backToField.current) focusField()
          backToField.current = false
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('readingConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {entered != null &&
              t(isMarine ? 'readingConfirmBodyMarine' : 'readingConfirmBody', {
                entered: withUnit(entered),
                last: withUnit(last),
              })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('readingConfirmChange')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              confirmed.current = true
              onConfirm()
            }}
          >
            {t('readingConfirmYes')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
