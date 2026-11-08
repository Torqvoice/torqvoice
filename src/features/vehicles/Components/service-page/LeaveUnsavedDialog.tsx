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

/**
 * A link was clicked with edits on the page, and the save it waited for was
 * refused: a required custom field left empty, a priced line with no name.
 * Staying keeps every edit on screen to be fixed. Leaving drops the edits made
 * since the last save and goes where the link points.
 */
export function LeaveUnsavedDialog({
  open,
  reason,
  onStay,
  onLeave,
}: {
  open: boolean
  /** Why the save was refused, as the save said it. */
  reason: string | null
  onStay: () => void
  onLeave: () => void
}) {
  const t = useTranslations('service.leaveUnsaved')
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p className="font-medium text-foreground">{reason || t('fallbackReason')}</p>
              <p>{t('hint')}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('stay')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onLeave}>
            {t('leave')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
