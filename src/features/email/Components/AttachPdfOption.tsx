'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { getAttachPdfDefault } from '@/features/email/Actions/emailPreferenceActions'

/**
 * The workshop's default answer to "attach the PDF", fetched when the dialog
 * opens so no page has to thread the setting down to it. Attaching until the
 * answer arrives: it is the old behaviour and the common one.
 */
export function useAttachPdf(open: boolean) {
  const [attachPdf, setAttachPdf] = useState(true)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getAttachPdfDefault().then((result) => {
      if (!cancelled && result.success && result.data) setAttachPdf(result.data.attachPdf)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  return [attachPdf, setAttachPdf] as const
}

/**
 * Sits under the email option in every send dialog. Off means the customer
 * gets the link instead, which is the only send that can be seen to have been
 * opened.
 *
 * Stays in place and goes dim when email is not the channel, rather than
 * appearing on the tick: a control that pops into existence moves everything
 * under it, including the row the cursor is already travelling towards. It
 * reads clearly enough disabled because it sits indented under the checkbox
 * that governs it.
 */
export function AttachPdfOption({
  id,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const t = useTranslations('common')

  return (
    <div className={`space-y-1 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          disabled={disabled}
        />
        <Label htmlFor={id} className="text-sm">
          {t('attachPdf')}
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">{t('attachPdfHint')}</p>
    </div>
  )
}
