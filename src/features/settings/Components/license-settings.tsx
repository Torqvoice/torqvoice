'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AppCard } from '@/components/app-card'
import {
  ArrowRight,
  ExternalLink,
  ImageIcon,
  Info,
  Key,
  Loader2,
  Lock,
  type LucideIcon,
  Type,
} from 'lucide-react'
import { validateLicense } from '../Actions/validateLicense'
import {
  LICENSE_TOKEN_MAX_AGE_DAYS,
  LICENSE_TOKEN_WARN_AGE_DAYS,
  type LicenseTokenStatus,
} from '@/lib/license/token'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * One line of the "make it yours" list. The list is always shown, so a
 * workshop sees what the licence unlocks before buying one: a locked row
 * says so, a row without a destination is for a member who is not the
 * install's administrator, and the rest are links.
 */
function NextStep({
  href,
  icon: Icon,
  label,
  lockedLabel,
}: {
  href: string | null
  icon: LucideIcon
  label: string
  /** shown instead of the arrow while the licence is missing */
  lockedLabel?: string
}) {
  const content = (
    <span className="flex items-center gap-3">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
  if (lockedLabel) {
    return (
      <div
        aria-disabled="true"
        className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted-foreground/70"
      >
        {content}
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {lockedLabel}
        </span>
      </div>
    )
  }
  if (!href) {
    return (
      <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted-foreground">
        {content}
      </div>
    )
  }
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
    >
      {content}
      <ArrowRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  )
}

export function LicenseSettings({
  initialKey,
  initialStatus,
  initialExpiresAt,
  initialIssuedAt,
  initialCheckedAt,
  brandingHref,
  demoMode = false,
}: {
  initialKey: string
  initialStatus: LicenseTokenStatus
  /** from the verified token; empty without one */
  initialExpiresAt: string
  /** when torqvoice.com last signed the stored token; empty without one */
  initialIssuedAt: string
  /** when this server last tried, reachable or not */
  initialCheckedAt: string
  /** the admin page that names the install in the browser; null for anyone who may not open it */
  brandingHref: string | null
  demoMode?: boolean
}) {
  const router = useRouter()
  const t = useTranslations('settings')
  const [licenseKey, setLicenseKey] = useState(initialKey)
  const [status, setStatus] = useState<LicenseTokenStatus>(initialStatus)
  const [isValidating, setIsValidating] = useState(false)

  const licenseValid = status === 'valid'
  const issuedAgeDays = initialIssuedAt
    ? Math.floor((Date.now() - new Date(initialIssuedAt).getTime()) / DAY_MS)
    : null
  const showUnverifiedHint =
    (status === 'valid' || status === 'stale') &&
    issuedAgeDays !== null &&
    issuedAgeDays >= LICENSE_TOKEN_WARN_AGE_DAYS

  const handleValidateLicense = async () => {
    setIsValidating(true)
    try {
      const result = await validateLicense(licenseKey)
      if (result.success && result.data) {
        setStatus(result.data.status)
        if (!result.data.reachable) {
          toast.error(t('license.unreachable'))
        } else if (result.data.valid) {
          toast.success(t('license.validated'))
        } else if (result.data.reason) {
          toast.error(t('license.rejected', { reason: result.data.reason }))
        } else {
          toast.error(t('license.invalid'))
        }
        router.refresh()
      } else {
        toast.error(result.error ?? t('license.failedValidate'))
      }
    } finally {
      setIsValidating(false)
    }
  }

  const statusBadge = licenseValid ? (
    <Badge variant="default">{t('license.active')}</Badge>
  ) : status === 'expired' ? (
    <Badge variant="destructive">{t('license.expired')}</Badge>
  ) : status === 'stale' ? (
    <Badge variant="outline">{t('license.unverified')}</Badge>
  ) : (
    <Badge variant="secondary">{t('license.inactive')}</Badge>
  )

  return (
    <div className="space-y-6">
      <AppCard
        id="license-white-label"
        icon={Key}
        title={t('license.title')}
        description={t('license.description')}
        action={
          !licenseValid && !demoMode ? (
            <Button asChild variant="default" size="sm" className="shrink-0">
              <a
                id="license-purchase"
                href={`${process.env.NEXT_PUBLIC_TORQVOICE_COM_URL || 'https://torqvoice.com'}/subscriptions/white-label`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('license.purchaseWhiteLabel')}
                <ExternalLink className="ml-2 h-3 w-3" />
              </a>
            </Button>
          ) : undefined
        }
        contentClassName="space-y-4"
      >
        <div id="license-status" className="flex flex-wrap items-center gap-2">
          <Label>{t('license.status')}</Label>
          {statusBadge}
          {initialExpiresAt && (
            <span className="text-xs text-muted-foreground">
              {t('license.expiresOn', { date: new Date(initialExpiresAt).toLocaleDateString() })}
            </span>
          )}
          {initialCheckedAt && (
            <span className="text-xs text-muted-foreground">
              {t('license.lastChecked', { date: new Date(initialCheckedAt).toLocaleDateString() })}
            </span>
          )}
        </div>
        {showUnverifiedHint && issuedAgeDays !== null && (
          <p className="text-xs text-amber-600">
            {t('license.unverifiedHint', {
              days: issuedAgeDays,
              max: LICENSE_TOKEN_MAX_AGE_DAYS,
            })}
          </p>
        )}
        <div className="flex gap-2">
          <Input
            id="license-key"
            placeholder={t('license.enterLicenseKey')}
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            className="font-mono"
          />
          <Button
            onClick={handleValidateLicense}
            disabled={isValidating || !licenseKey.trim()}
            variant="outline"
          >
            {isValidating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Key className="mr-2 h-4 w-4" />
            )}
            {t('license.validate')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('license.keyHint')}</p>
        <p className="text-xs text-muted-foreground">{t('license.signedHint')}</p>
        <div id="license-next-steps" className="space-y-3 pt-2">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('license.makeItYours')}</p>
            <p className="text-xs text-muted-foreground">
              {licenseValid ? t('license.makeItYoursHint') : t('license.makeItYoursLocked')}
            </p>
          </div>
          <div className="divide-y overflow-hidden rounded-lg border bg-muted/20">
            <NextStep
              href={brandingHref}
              icon={Type}
              label={t('license.linkAppName')}
              lockedLabel={licenseValid ? undefined : t('license.needsLicense')}
            />
            <NextStep
              href={brandingHref}
              icon={ImageIcon}
              label={t('license.linkAppIcon')}
              lockedLabel={licenseValid ? undefined : t('license.needsLicense')}
            />
          </div>
          {brandingHref === null && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t('license.adminOnlyHint')}</span>
            </p>
          )}
        </div>
      </AppCard>
    </div>
  )
}
