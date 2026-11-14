'use client'

import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { getShareChannels } from '../Actions/getShareChannels'

const statusSchema = z.enum(['ready', 'not_connected', 'not_in_plan'])

const shareChannelsSchema = z.object({
  sms: statusSchema,
  isCloud: z.boolean(),
})

export type ShareChannels = z.infer<typeof shareChannelsSchema>

/**
 * The state of each channel a share dialog offers, asked when the dialog
 * opens. Undefined until the answer is in, and a channel stays unticked for
 * that moment rather than promising something it may not be able to do.
 */
export function useShareChannels(open: boolean): ShareChannels | undefined {
  const { data } = useQuery({
    queryKey: ['share-channels'],
    queryFn: async () => {
      const res = await getShareChannels()
      if (!res.success) throw new Error(res.error)
      return shareChannelsSchema.parse(res.data)
    },
    enabled: open,
    staleTime: 60_000,
    retry: false,
  })
  return data
}
