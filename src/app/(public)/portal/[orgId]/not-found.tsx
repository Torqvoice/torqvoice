'use client'

import { useTranslations } from 'next-intl'
import { PortalProblemScreen } from '@/features/portal/Components/PortalProblemScreen'

export default function PortalNotFound() {
  const t = useTranslations('portal.shell')
  return <PortalProblemScreen title={t('pageNotFoundTitle')} body={t('pageNotFoundBody')} />
}
