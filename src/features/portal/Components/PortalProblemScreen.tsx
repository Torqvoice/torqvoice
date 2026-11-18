'use client'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PortalPlainScreen } from './PortalPlainScreen'
import { PortalButton, PortalLinkButton } from './Ui'

/**
 * What a customer sees when a portal page breaks or does not exist: a plain
 * sentence and a way back to the home page, never a stack trace.
 */
export function PortalProblemScreen({
  title,
  body,
  onRetry,
}: {
  title: string
  body: string
  onRetry?: () => void
}) {
  const t = useTranslations('portal.shell')
  const params = useParams<{ orgId?: string }>()
  const orgId = params?.orgId

  return (
    <PortalPlainScreen title={title} body={body}>
      {onRetry && (
        <PortalButton variant="accent" onClick={onRetry}>
          {t('tryAgain')}
        </PortalButton>
      )}
      {orgId && (
        <PortalLinkButton
          variant={onRetry ? 'outline' : 'accent'}
          href={`/portal/${orgId}/dashboard`}
        >
          {t('backHome')}
        </PortalLinkButton>
      )}
    </PortalPlainScreen>
  )
}
