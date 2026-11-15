'use client'

import { QueryClient, QueryClientContext } from '@tanstack/react-query'
import { useContext } from 'react'

/**
 * The query client the chat reads and polls through: the app's own, from the
 * root layout. A portal component drawn without it (on its own, in a test)
 * gets one of the chat's, so the unread badge in every theme's navigation
 * never depends on what happens to be mounted above it.
 */
let own: QueryClient | null = null

export function usePortalQueryClient(): QueryClient {
  const provided = useContext(QueryClientContext)
  if (provided) return provided
  own ??= new QueryClient()
  return own
}

export const portalThreadKey = (orgParam: string) => ['portal-thread', orgParam] as const
export const portalUnreadKey = (orgParam: string) => ['portal-unread', orgParam] as const
