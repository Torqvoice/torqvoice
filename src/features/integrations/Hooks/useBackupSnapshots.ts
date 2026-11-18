'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { z } from 'zod'
import { handleGated } from '@/components/upgrade-gate'
import { listBackupSnapshots } from '@/features/integrations/Actions/listBackupSnapshots'

const snapshotSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  time: z.string(),
  bytes: z.number().nullable(),
  filesNew: z.number().nullable(),
  dataAdded: z.number().nullable(),
  files: z.boolean(),
  trigger: z.enum(['scheduled', 'manual']).nullable(),
  thisWorkshop: z.boolean(),
})

export type BackupSnapshot = z.infer<typeof snapshotSchema>

/** A refusal comes back as a key under errors (restoreOwnerOnly, restoreBusy). */
export function useActionErrorText() {
  const tc = useTranslations('integrations')
  return (error: string | undefined) =>
    error && tc.has(`errors.${error}`) ? tc(`errors.${error}`) : error || tc('errors.generic')
}

/**
 * Every backup in the destination's repository, read only once asked for:
 * listing them is a round trip to the storage, and the recent runs already
 * cover the usual case. Cached per workshop as well as per connector: a
 * switch of workshop keeps the query client, and the other workshop's list
 * must not be shown for the minute it stays fresh.
 */
export function useBackupSnapshots(organizationId: string, connectorId: string, enabled: boolean) {
  const errorText = useActionErrorText()
  return useQuery({
    queryKey: ['backup-snapshots', organizationId, connectorId],
    queryFn: async () => {
      const res = await listBackupSnapshots(connectorId)
      if (!res.success) {
        handleGated(res)
        throw new Error(errorText(res.error))
      }
      return z.array(snapshotSchema).parse(res.data)
    },
    enabled,
    staleTime: 60_000,
  })
}
