'use client'

import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { getWhatsappWindowState } from '@/features/whatsapp/Actions/whatsappActions'
import { getShareChannels } from '../Actions/getShareChannels'

const statusSchema = z.enum(['ready', 'not_connected', 'not_in_plan', 'turned_off'])

const shareChannelsSchema = z.object({
  email: statusSchema,
  sms: statusSchema,
  whatsapp: statusSchema,
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

const windowSchema = z.object({
  configured: z.boolean(),
  open: z.boolean(),
  hasTemplate: z.boolean(),
  templateCarriesMessage: z.boolean(),
})

/**
 * Whether a WhatsApp message can reach this customer right now.
 *
 * WhatsApp lets a business write freely only for 24 hours after the customer
 * last wrote; after that an approved template is the only way through. The
 * dialog asks before offering the channel, so the workshop hears about the
 * rule while choosing how to send, not from a failed send. Undefined until
 * the answer is in.
 */
export function useWhatsappReach(enabled: boolean, customerId: string | undefined) {
  const { data } = useQuery({
    queryKey: ['whatsapp-window', customerId],
    queryFn: async () => {
      const res = await getWhatsappWindowState(customerId as string)
      if (!res.success) throw new Error(res.error)
      return windowSchema.parse(res.data)
    },
    enabled: enabled && !!customerId,
    // Short: the customer writing back is what opens the window.
    staleTime: 15_000,
    retry: false,
  })
  if (!data) return undefined
  // A link needs a template with the message variable to ride in.
  return data.configured && (data.open || (data.hasTemplate && data.templateCarriesMessage))
}
