'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AppCard } from '@/components/app-card'
import {
  ArrowRight,
  Building2,
  Copy,
  ExternalLink,
  ImageIcon,
  Infinity as InfinityIcon,
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
  type LicenseTokenKind,
  type LicenseTokenStatus,
  normalizeRegistrationNumber,
  type PerpetualLicensee,
} from '@/lib/license/token'

const DAY_MS = 24 * 60 * 60 * 1000

const TORQVOICE_COM_URL = process.env.NEXT_PUBLIC_TORQVOICE_COM_URL || 'https://torqvoice.com'

/** Where the workshop's organization number is set; the field's own id is the anchor. */
const ORG_NUMBER_HREF = '/settings/company#orgNumber'

/**
 * The licence request code the offline checkout on torqvoice.com takes, so
 * nobody types an organization id by hand: `tvr1.` plus base64url JSON of
 * what the token will be minted for. Not signed; torqvoice.com only reads it.
 */
export function licenseRequestCode(
  organizationId: string,
  workshopName: string,
  registrationNumber: string
): string {
  const json = JSON.stringify({ v: 1, org: organizationId, name: workshopName, registrationNumber })
  // UTF-8 first: workshop names are rarely plain ASCII.
  let binary = ''
  for (const byte of new TextEncoder().encode(json)) binary += String.fromCharCode(byte)
  const base64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `tvr1.${base64url}`
}

/** "NO" reads as "Norway" in the workshop's language; an unknown code stays as it is. */
function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

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
  initialKind,
  initialLicensee,
  initialMaxOrganizations,
  initialExpiresAt,
  initialIssuedAt,
  initialCheckedAt,
  organizationId,
  workshopName,
  registrationNumber,
  brandingHref,
  demoMode = false,
}: {
  initialKey: string
  initialStatus: LicenseTokenStatus
  /** subscription or offline (perpetual); null without a readable token */
  initialKind: LicenseTokenKind | null
  /** who an offline licence was issued to; null for a subscription */
  initialLicensee: PerpetualLicensee | null
  /** workshops an offline licence covers; null unless the token says */
  initialMaxOrganizations: number | null
  /** from the verified token; empty without one or for an offline licence */
  initialExpiresAt: string
  /** when torqvoice.com last signed the stored token; empty without one */
  initialIssuedAt: string
  /** when this server last tried, reachable or not */
  initialCheckedAt: string
  organizationId: string
  /** the organization's own name, carried in the request code */
  workshopName: string
  /** the workshop's organization number setting; empty when not set */
  registrationNumber: string
  /** the admin page that names the install in the browser; null for anyone who may not open it */
  brandingHref: string | null
  demoMode?: boolean
}) {
  const router = useRouter()
  const t = useTranslations('settings')
  const locale = useLocale()
  const [licenseKey, setLicenseKey] = useState(initialKey)
  const [status, setStatus] = useState<LicenseTokenStatus>(initialStatus)
  const [kind, setKind] = useState<LicenseTokenKind | null>(initialKind)
  const [licensee, setLicensee] = useState<PerpetualLicensee | null>(initialLicensee)
  const [isValidating, setIsValidating] = useState(false)

  const licenseValid = status === 'valid'
  const perpetual = kind === 'perpetual'
  // An offline token that checked out, whether or not it matches this workshop.
  const showLicensee =
    perpetual && licensee !== null && status !== 'missing' && status !== 'invalid'
  const hasRegistrationNumber = normalizeRegistrationNumber(registrationNumber).length > 0
  const requestCode = hasRegistrationNumber
    ? licenseRequestCode(organizationId, workshopName, registrationNumber)
    : ''
  const issuedAgeDays = initialIssuedAt
    ? Math.floor((Date.now() - new Date(initialIssuedAt).getTime()) / DAY_MS)
    : null
  // An offline licence never checks in, so it is never unverified.
  const showUnverifiedHint =
    !perpetual &&
    (status === 'valid' || status === 'stale') &&
    issuedAgeDays !== null &&
    issuedAgeDays >= LICENSE_TOKEN_WARN_AGE_DAYS

  const mismatchMessage = (licensed: string) =>
    hasRegistrationNumber
      ? t('license.mismatchExplain', { licensed, current: registrationNumber })
      : t('license.mismatchExplainNotSet', { licensed })

  const handleValidateLicense = async () => {
    setIsValidating(true)
    try {
      const result = await validateLicense(licenseKey)
      if (result.success && result.data) {
        const data = result.data
        setStatus(data.status)
        setKind(data.kind)
        setLicensee(data.licensee)
        if (data.status === 'mismatch') {
          toast.error(mismatchMessage(data.licensee?.registrationNumber ?? ''))
        } else if (data.kind === 'perpetual' && data.valid) {
          toast.success(t('license.offlineActivated'))
        } else if (data.kind !== 'perpetual' && !data.reachable) {
          // Only a subscription key goes to torqvoice.com.
          toast.error(t('license.unreachable'))
        } else if (data.valid) {
          toast.success(t('license.validated'))
        } else if (data.reason) {
          toast.error(t('license.rejected', { reason: data.reason }))
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

  const handleCopyRequestCode = async () => {
    try {
      await navigator.clipboard.writeText(requestCode)
      toast.success(t('license.requestCodeCopied'))
    } catch {
      toast.error(t('license.requestCodeCopyFailed'))
    }
  }

  const statusBadge = licenseValid ? (
    <Badge variant="default">{t('license.active')}</Badge>
  ) : status === 'mismatch' ? (
    <Badge variant="destructive">{t('license.mismatch')}</Badge>
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
                href={`${TORQVOICE_COM_URL}/subscriptions/white-label`}
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
          {licenseValid && perpetual && (
            <Badge variant="outline" className="gap-1">
              <InfinityIcon className="h-3 w-3" aria-hidden="true" />
              {t('license.perpetual')}
            </Badge>
          )}
          {!perpetual && initialExpiresAt && (
            <span className="text-xs text-muted-foreground">
              {t('license.expiresOn', { date: new Date(initialExpiresAt).toLocaleDateString() })}
            </span>
          )}
          {!perpetual && initialCheckedAt && (
            <span className="text-xs text-muted-foreground">
              {t('license.lastChecked', { date: new Date(initialCheckedAt).toLocaleDateString() })}
            </span>
          )}
        </div>
        {showLicensee && licensee && (
          <div id="license-licensee" className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
            <p className="flex items-start gap-2 text-sm font-medium">
              <Building2
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 break-words">
                {t('license.licensedTo', {
                  name: licensee.name,
                  registrationNumber: licensee.registrationNumber,
                  country: countryName(licensee.country, locale),
                })}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{t('license.perpetualHint')}</p>
            {initialMaxOrganizations !== null && (
              <p className="text-xs text-muted-foreground">
                {t('license.perpetualWorkshops', { count: initialMaxOrganizations })}
              </p>
            )}
            {status === 'mismatch' && (
              <p className="text-xs text-destructive">
                {mismatchMessage(licensee.registrationNumber)}{' '}
                <Link href={ORG_NUMBER_HREF} className="font-medium underline underline-offset-2">
                  {t('license.openCompanySettings')}
                </Link>
              </p>
            )}
          </div>
        )}
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
      {/* The way to an offline licence, until one is active. The demo runs on our licence. */}
      {!demoMode && !(licenseValid && perpetual) && (
        <AppCard
          id="license-offline"
          icon={InfinityIcon}
          title={t('license.offlineTitle')}
          description={t('license.offlineDescription')}
          contentClassName="space-y-4"
        >
          <p className="text-sm text-muted-foreground">{t('license.offlineBinding')}</p>
          <dl className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">
            <div className="min-w-0 space-y-0.5">
              <dt className="text-xs text-muted-foreground">
                {t('license.offlineOrganizationId')}
              </dt>
              <dd className="break-all font-mono text-xs">{organizationId}</dd>
            </div>
            <div className="min-w-0 space-y-0.5">
              <dt className="text-xs text-muted-foreground">{t('license.offlineWorkshop')}</dt>
              <dd className="break-words">{workshopName}</dd>
            </div>
            <div className="min-w-0 space-y-0.5">
              <dt className="text-xs text-muted-foreground">{t('license.offlineOrgNumber')}</dt>
              {hasRegistrationNumber ? (
                <dd className="break-all font-mono text-xs">{registrationNumber}</dd>
              ) : (
                <dd className="space-y-1">
                  <span className="block text-amber-600">{t('license.notSet')}</span>
                  <Link
                    href={ORG_NUMBER_HREF}
                    className="block text-xs font-medium underline underline-offset-2"
                  >
                    {t('license.openCompanySettings')}
                  </Link>
                </dd>
              )}
            </div>
          </dl>
          {!hasRegistrationNumber && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t('license.offlineOrgNumberRequired')}</span>
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="license-request-code">{t('license.requestCode')}</Label>
            <div className="flex gap-2">
              <Input
                id="license-request-code"
                readOnly
                value={requestCode}
                onFocus={(e) => e.target.select()}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCopyRequestCode}
                disabled={!hasRegistrationNumber}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t('license.copyRequestCode')}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t('license.offlineOrderHint')}</p>
            <Button asChild variant="default" size="sm" className="shrink-0">
              <a
                href={`${TORQVOICE_COM_URL}/subscriptions/offline-license`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('license.orderOffline')}
                <ExternalLink className="ml-2 h-3 w-3" />
              </a>
            </Button>
          </div>
        </AppCard>
      )}
    </div>
  )
}
