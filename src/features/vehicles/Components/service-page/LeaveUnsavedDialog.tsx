'use client'

import { useTranslations } from 'next-intl'
import {
  ConfirmFrame,
  ConfirmFrameAction,
  ConfirmFrameCancel,
  ConfirmFrameText,
} from '@/components/confirm-dialog'

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
    <ConfirmFrame
      open={open}
      onDismiss={onStay}
      title={t('title')}
      destructive
      footer={
        <>
          <ConfirmFrameCancel>{t('stay')}</ConfirmFrameCancel>
          <ConfirmFrameAction destructive onClick={onLeave}>
            {t('leave')}
          </ConfirmFrameAction>
        </>
      }
    >
      <ConfirmFrameText>
        <p className="text-foreground font-medium">{reason || t('fallbackReason')}</p>
        <p>{t('hint')}</p>
      </ConfirmFrameText>
    </ConfirmFrame>
  )
}
