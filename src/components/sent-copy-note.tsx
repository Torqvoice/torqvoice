'use client'

import { useTranslations } from 'next-intl'
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
import { useDayFormatter } from '@/features/calendar/Components/useDayFormatter'
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
  const format = useDayFormatter()
  if (!sentAt) return null
  const date = format.dateTime(new Date(sentAt), { dateStyle: 'medium' })
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
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('confirmBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('confirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
