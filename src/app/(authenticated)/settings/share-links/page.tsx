import { stampServerRender } from '@/components/infinite-list/server-render'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import type { SettingKey } from '@/features/settings/Schema/settingsSchema'
import { getShareLinkRows } from '@/features/share-links/Actions/getShareLinkRows'
import { getAppBaseUrl } from '@/lib/app-url'
import { settingsPageTitle } from '@/lib/page-title'
import { ALL_SHARE_EXPIRY_SETTING_KEYS, readShareExpiryRules } from '@/lib/share-expiry'
import { ShareLinksSettings } from './share-links-settings'

export function generateMetadata() {
  return settingsPageTitle('shareLinks')
}

export default async function ShareLinksSettingsPage({
  searchParams,
}: {
  // An old ?page= link is simply ignored: the list loads more as it scrolls.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const one = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const [settingsResult, linksResult] = await Promise.all([
    getSettings(ALL_SHARE_EXPIRY_SETTING_KEYS as SettingKey[]),
    // The first batch; the rest load through the same action as the list scrolls.
    getShareLinkRows({
      status: one('status'),
      kind: one('kind'),
      search: one('search'),
    }),
  ])

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}

  return (
    <ShareLinksSettings
      rules={readShareExpiryRules(settings)}
      links={linksResult.success && linksResult.data ? stampServerRender(linksResult.data) : null}
      baseUrl={getAppBaseUrl()}
      filters={{
        status: one('status') === 'expired' || one('status') === 'all' ? one('status')! : 'active',
        kind: one('kind') ?? 'all',
        search: one('search') ?? '',
      }}
    />
  )
}
