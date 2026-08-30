import { ShieldOff } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { NoAccessSignOut } from './no-access-actions'

/**
 * What somebody sees when their role grants them nothing.
 *
 * They used to see the whole application: a full sidebar, and every page
 * behind it answering "Your role does not allow this". An account that can
 * reach no screen at all should say so once, plainly, rather than let somebody
 * discover it one refusal at a time.
 *
 * Deliberately names who fixes it. The person reading this cannot: only an
 * owner or admin of their workshop can give them a role, and without that
 * sentence the obvious conclusion is that the product is broken.
 */
export async function NoAccess({ organizationName }: { organizationName: string }) {
  const t = await getTranslations('settings.team')

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="space-y-2">
          <h1 className="font-semibold text-lg">{t('noAccessTitle')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('noAccessBody', { workshop: organizationName })}
          </p>
        </div>

        <div className="pt-2">
          <NoAccessSignOut />
        </div>
      </div>
    </div>
  )
}
