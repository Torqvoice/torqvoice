'use client'

import { useTranslations } from 'next-intl'
import {
  ConfirmFrame,
  ConfirmFrameAction,
  ConfirmFrameCancel,
  ConfirmFrameText,
} from '@/components/confirm-dialog'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'

/**
 * The one sentence every part of a job says once its invoice has gone out.
 *
 * A sent invoice is the customer's copy: its PDF is what was sent, and a
 * change made on the job afterwards (a mark, a photo, a switch about what
 * prints) reaches it only when the invoice is sent again. Tools that keep
 * working on a sent job show this instead of wording of their own, so the
 * rule reads the same everywhere.
 */
export function SentCopyNote({
  sentAt,
  className,
}: {
  /** When the invoice was issued; nothing is drawn while it has not been. */
  sentAt: string | Date | null | undefined
  className?: string
}) {
  const t = useTranslations('common.sentCopy')
  // The day it was issued, in the workshop's date format and on its clock.
  const { formatDate } = useFormatDate()
  if (!sentAt) return null
  const date = formatDate(new Date(sentAt))
  return (
    <p data-testid="sent-copy-note" className={cn('text-xs text-muted-foreground', className)}>
      {t('note', { date })}
    </p>
  )
}

/**
 * Asked before a change on a sent job that the sent invoice will not show:
 * the change is kept on the job and goes on the invoice when it is reopened
 * and sent again. The same question for every tool, so the rule reads the
 * same wherever it applies.
 */
export function SentCopyConfirm({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useTranslations('common.sentCopy')
  return (
    <ConfirmFrame
      open={open}
      onDismiss={onCancel}
      title={t('confirmTitle')}
      footer={
        <>
          <ConfirmFrameCancel>{t('cancel')}</ConfirmFrameCancel>
          <ConfirmFrameAction onClick={onConfirm}>{t('confirm')}</ConfirmFrameAction>
        </>
      }
    >
      <ConfirmFrameText>
        <p>{t('confirmBody')}</p>
      </ConfirmFrameText>
    </ConfirmFrame>
  )
}
