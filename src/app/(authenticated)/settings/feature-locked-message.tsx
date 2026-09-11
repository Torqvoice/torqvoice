import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getTranslations } from 'next-intl/server'

interface FeatureLockedProps {
  feature: string
  description: string
  isCloud: boolean
  /**
   * The real page, rendered behind the notice. A locked page used to be
   * replaced by a paragraph, so a workshop deciding whether to pay could not
   * see what it would get. Now it sees the templates, the portal switches,
   * the webhook table, all of it, dimmed and inert, with the notice on top.
   */
  children?: React.ReactNode
}

/**
 * The one way a plan-gated settings page says no.
 *
 * Every gated page renders this, with the same words and the same button, so
 * a PRO badge in the navigation always means the same thing on the other
 * side of the click. Server actions enforce the plan independently; this is
 * only what the person sees.
 */
export async function FeatureLocked({
  feature,
  description,
  isCloud,
  children,
}: FeatureLockedProps) {
  const t = await getTranslations('settings')
  const upgradeHref = isCloud ? '/settings/subscription' : '/settings/license'
  const upgradeLabel = isCloud ? t('featureLocked.upgradePlan') : t('featureLocked.activateLicense')
  const requirement = isCloud ? t('featureLocked.requiresPro') : t('featureLocked.requiresLicense')

  const notice = (
    <div className="glass flex w-full max-w-md flex-col items-center rounded-2xl px-6 py-8 text-center shadow-2xl">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-6 w-6 text-primary" />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-primary">
        {requirement}
      </p>
      <h2 className="mt-1 text-lg font-semibold">{feature}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {children && (
        <p className="mt-3 text-xs text-muted-foreground">{t('featureLocked.previewHint')}</p>
      )}
      <Button asChild className="mt-5" size="sm">
        <Link href={upgradeHref}>{upgradeLabel}</Link>
      </Button>
    </div>
  )

  if (!children) {
    return <div className="flex flex-col items-center justify-center py-16">{notice}</div>
  }

  return (
    <div className="relative">
      <div
        aria-hidden
        // `inert` keeps every control behind the notice out of the tab order
        // and off the pointer, so the preview cannot be used by accident.
        inert
        className="pointer-events-none select-none opacity-60 blur-[1.5px]"
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center p-4 pt-10 sm:pt-16">
        <div className="sticky top-24 w-full max-w-md">{notice}</div>
      </div>
    </div>
  )
}

/** @deprecated Use FeatureLocked; kept so older imports keep compiling. */
export const FeatureLockedMessage = FeatureLocked
