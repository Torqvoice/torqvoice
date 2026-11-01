'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { getIntegrationActivity } from '@/features/integrations/Actions/integrationActions'
import type { ActivityCursor, ActivityPage } from '@/features/integrations/Lib/types'

const jobSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.string(),
  attempts: z.number(),
  error: z.string().nullable(),
  runAfter: z.string(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
})

const pageSchema = z.object({
  items: z.array(
    z.discriminatedUnion('type', [
      jobSchema.extend({ type: z.literal('job') }),
      z.object({
        type: z.literal('batch'),
        batchId: z.string(),
        kind: z.string(),
        createdAt: z.string(),
        counts: z.object({
          queued: z.number(),
          running: z.number(),
          done: z.number(),
          failed: z.number(),
          dead: z.number(),
        }),
        failures: z.array(jobSchema),
      }),
    ])
  ),
  logs: z.array(
    z.object({
      id: z.string(),
      level: z.string(),
      message: z.string(),
      details: z.unknown(),
      createdAt: z.string(),
    })
  ),
  nextCursor: z.object({ at: z.string(), key: z.string() }).nullable(),
}) satisfies z.ZodType<ActivityPage>

/** Cached per workshop as well as per connector: a switch of workshop keeps the query client. */
export function integrationActivityKey(organizationId: string, connectorId: string) {
  return ['integration-activity', organizationId, connectorId] as const
}

/**
 * A connection's activity, twenty lines at a time, newest first. The page
 * renders the newest twenty on the server; older ones load as the list is
 * scrolled. A refetch fetches every loaded page again from the top, each one
 * starting where the fresh page before it ended, so lines that new jobs push
 * down are neither lost nor shown twice.
 */
export function useIntegrationActivity(
  organizationId: string,
  connectorId: string,
  initial: ActivityPage
) {
  return useInfiniteQuery({
    queryKey: integrationActivityKey(organizationId, connectorId),
    queryFn: async ({ pageParam }) => {
      const res = await getIntegrationActivity(connectorId, pageParam)
      if (!res.success || !res.data) throw new Error(res.error || 'activity')
      return pageSchema.parse(res.data)
    },
    initialPageParam: null as ActivityCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: { pages: [initial], pageParams: [null] },
  })
}
