'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { z } from 'zod'
import { getSmsSendingNotice } from '../Actions/getSmsSendingNotice'

const noticeSchema = z.object({ platformSmsPerDay: z.number().nullable() })

/**
 * Says, in a compose dialog, that the text goes from the platform's shared
 * number and that replies will not arrive. Renders nothing for a workshop
 * with its own provider, and nothing while it does not know: a notice that
 * fails to load must not get in the way of sending.
 */
export function SharedNumberNotice({ enabled }: { enabled: boolean }) {
  const t = useTranslations('messages.conversation')
  const { data } = useQuery({
    queryKey: ['sms-sending-notice'],
    queryFn: async () => {
      const res = await getSmsSendingNotice()
      if (!res.success) throw new Error(res.error)
      return noticeSchema.parse(res.data)
    },
    enabled,
    staleTime: 60_000,
    retry: false,
  })

  if (data?.platformSmsPerDay == null) return null
  return (
    <p className="text-xs text-muted-foreground">
      {t('sharedNumber', { limit: data.platformSmsPerDay })}
    </p>
  )
}
