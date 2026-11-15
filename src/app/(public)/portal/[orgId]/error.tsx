'use client'

import { useTranslations } from 'next-intl'
import { PortalProblemScreen } from '@/features/portal/Components/PortalProblemScreen'

export default function PortalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('portal.shell')
  return <PortalProblemScreen title={t('errorTitle')} body={t('errorBody')} onRetry={reset} />
}
