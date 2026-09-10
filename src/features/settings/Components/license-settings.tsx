'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AppCard } from '@/components/app-card'
import { ExternalLink, Key, Loader2 } from 'lucide-react'
import { validateLicense } from '../Actions/validateLicense'
import {
  LICENSE_TOKEN_MAX_AGE_DAYS,
  LICENSE_TOKEN_WARN_AGE_DAYS,
  type LicenseTokenStatus,
} from '@/lib/license/token'

const DAY_MS = 24 * 60 * 60 * 1000

export function LicenseSettings({
  initialKey,
  initialStatus,
  initialExpiresAt,
  initialIssuedAt,
  initialCheckedAt,
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
        icon={Key}
        title={t('license.title')}
        description={t('license.description')}
        action={
          !licenseValid && !demoMode ? (
            <Button asChild variant="default" size="sm" className="shrink-0">
              <a
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
        <div className="flex flex-wrap items-center gap-2">
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
      </AppCard>
    </div>
  )
}
