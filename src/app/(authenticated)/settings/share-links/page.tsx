import { getSettings } from '@/features/settings/Actions/settingsActions'
import type { SettingKey } from '@/features/settings/Schema/settingsSchema'
import { getShareLinksPage } from '@/features/share-links/Actions/getShareLinksPage'
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
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const one = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const [settingsResult, linksResult] = await Promise.all([
    getSettings(ALL_SHARE_EXPIRY_SETTING_KEYS as SettingKey[]),
    getShareLinksPage({
      status: one('status'),
      kind: one('kind'),
      search: one('search'),
      page: one('page'),
      pageSize: one('pageSize'),
    }),
  ])

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}

  return (
    <ShareLinksSettings
      rules={readShareExpiryRules(settings)}
      links={linksResult.success && linksResult.data ? linksResult.data : null}
      baseUrl={getAppBaseUrl()}
      filters={{
        status: one('status') === 'expired' || one('status') === 'all' ? one('status')! : 'active',
        kind: one('kind') ?? 'all',
        search: one('search') ?? '',
      }}
    />
  )
}
