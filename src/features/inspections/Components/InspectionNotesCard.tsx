'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updateInspectionDetails } from '../Actions/inspectionActions'

/** How long typing may pause before the note is written without leaving the field. */
const IDLE_MS = 1500

/**
 * The remarks on the inspection as a whole: what the technician wants the
 * customer and the certificate to say beyond the graded checks. Printed on
 * the certificate and shown on the customer's link, and until now editable
 * nowhere on this page.
 *
 * Saves itself: when the field is left, and after a pause in typing, so a
 * reload mid-sentence loses at most the last second and a half.
 */
export function InspectionNotesCard({
  inspectionId,
  notes,
  disabled = false,
}: {
  inspectionId: string
  notes: string | null
  disabled?: boolean
}) {
  const t = useTranslations('inspections.page')
  const router = useRouter()
  const [value, setValue] = useState(notes ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const saved = useRef(notes ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commit = (text: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (text === saved.current) return
    setSaving(true)
    updateInspectionDetails(inspectionId, { notes: text.trim() || null })
      .then((result) => {
        if (result.success) {
          saved.current = text
          setSavedAt(new Date())
          router.refresh()
        } else {
          toast.error(result.error || t('saveFailed'))
        }
      })
      .finally(() => setSaving(false))
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  return (
    <section aria-labelledby="inspection-notes" className="bg-card rounded-lg border p-4">
      <Label
        htmlFor="inspection-notes-field"
        id="inspection-notes"
        className="text-sm font-semibold"
      >
        {t('notes')}
      </Label>
      <p className="text-muted-foreground mt-0.5 text-xs">{t('notesHint')}</p>
      <Textarea
        id="inspection-notes-field"
        value={value}
        rows={4}
        maxLength={5000}
        disabled={disabled}
        placeholder={t('notesPlaceholder')}
        className="mt-2 resize-y text-sm"
        onChange={(e) => {
          const next = e.target.value
          setValue(next)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => commit(next), IDLE_MS)
        }}
        onBlur={() => commit(value)}
      />
      <p className="text-muted-foreground mt-1.5 min-h-4 text-xs" role="status">
        {saving
          ? t('saving')
          : savedAt
            ? t('savedAt', {
                time: savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              })
            : null}
      </p>
    </section>
  )
}
