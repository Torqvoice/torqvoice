'use server'

import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { getCachedMembership } from '@/lib/cached-session'
import { isCloudMode } from '@/lib/features'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { getWhatsNewFeed } from '../Lib/feed.server'
import { WHATS_NEW_PAGE_SIZE } from '../Lib/paging'
import { selectEntries } from '../Lib/select'

/**
 * The screens this person can open, by the same rule the signed-in layout
 * uses for the sidebar: owners and admins see everything, a member sees what
 * their role can read, and a member without a role sees nothing.
 */
async function readableSubjects(userId: string, role: string): Promise<string[]> {
  const all = Object.values(PermissionSubject)
  if (role === 'owner' || role === 'admin' || role === 'super_admin') return all
  const membership = await getCachedMembership(userId)
  if (!membership?.roleId) return []
  const permissions = membership.customRole?.permissions ?? []
  return all.filter((subject) =>
    hasPermission(permissions, { action: PermissionAction.READ, subject })
  )
}

/**
 * The next page of highlights for the panel, from where the reader has
 * scrolled to. Read from the list this server already holds, so scrolling
 * never sends anything to torqvoice.com, and narrowed for this person
 * exactly as the first page was.
 */
export async function loadMoreWhatsNew(offset: unknown) {
  return withAuth(
    async ({ userId, role }) => {
      const from = z.number().int().min(0).max(1000).parse(offset)
      if (!isCloudMode()) return { entries: [], hasMore: false }
      const all = selectEntries(await getWhatsNewFeed(await getLocale()), {
        appVersion: process.env.APP_VERSION || 'development',
        cloud: true,
        visibleSubjects: await readableSubjects(userId, role),
      })
      return {
        entries: all.slice(from, from + WHATS_NEW_PAGE_SIZE),
        hasMore: all.length > from + WHATS_NEW_PAGE_SIZE,
      }
    },
    { allowDuringRestore: true }
  )
}
