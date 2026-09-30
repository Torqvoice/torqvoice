import { notFound } from 'next/navigation'
import { getAuthContext } from '@/lib/get-auth-context'
import { WORKSHOP_CHAT_ENABLED } from '@/features/ai/constants'
import { getFeatures } from '@/lib/features'
import { isAiConfigured } from '@/features/integrations/Lib/ai'
import { PageHeader } from '@/components/page-header'
import { AiChatPage } from '@/features/ai/Components/AiChatPage'
import { getTranslations } from 'next-intl/server'
import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'

/**
 * The workshop-wide assistant: a chat that answers by querying this
 * organization's data. Switched off with WORKSHOP_CHAT_ENABLED.
 */
export default async function AiAssistantPage() {
  if (!WORKSHOP_CHAT_ENABLED) notFound()
  const authContext = await getAuthContext()
  const t = await getTranslations('aiChat')

  let aiEnabled = false
  if (authContext) {
    const [features, configured] = await Promise.all([
      getFeatures(authContext.organizationId),
      isAiConfigured(authContext.organizationId).catch(() => false),
    ])
    aiEnabled = features.ai && configured
  }

  // Same rule as withAuth: owners, admins and admin roles may; anyone else
  // needs the permission on their role, and a member with no role has none.
  if (aiEnabled && authContext && !authContext.isAdmin) {
    const membership = await getCachedMembership(authContext.userId)
    aiEnabled = hasPermission(membership?.customRole?.permissions ?? [], {
      action: PermissionAction.READ,
      subject: PermissionSubject.AI_ASSISTANT,
    })
  }

  if (!aiEnabled) {
    return (
      <div className="flex h-svh flex-col overflow-hidden">
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{t('notEnabled')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <PageHeader />
      <AiChatPage />
    </div>
  )
}
