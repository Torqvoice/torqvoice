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
 */
export function AttachPdfOption({
  id,
  checked,
  onCheckedChange,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const t = useTranslations('common')

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
        <Label htmlFor={id} className="text-sm">
          {t('attachPdf')}
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">{t('attachPdfHint')}</p>
    </div>
  )
}
