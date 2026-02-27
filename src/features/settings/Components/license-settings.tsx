'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ExternalLink, Key, Loader2 } from 'lucide-react'
import { validateLicense } from '../Actions/validateLicense'

export function LicenseSettings({
  initialKey,
  initialValid,
  initialPlan,
  initialCheckedAt,
}: {
  initialKey: string
  initialValid: boolean
  initialPlan: string
  initialCheckedAt: string
}) {
  const router = useRouter()
  const t = useTranslations('settings')
  const [licenseKey, setLicenseKey] = useState(initialKey)
  const [licenseValid, setLicenseValid] = useState(initialValid)
  const [licensePlan, setLicensePlan] = useState(initialPlan)
  const [isValidating, setIsValidating] = useState(false)

  const handleValidateLicense = async () => {
    setIsValidating(true)
    try {
      const result = await validateLicense(licenseKey)
      if (result.success && result.data) {
        setLicenseValid(result.data.valid)
        if (result.data.plan) {
          setLicensePlan(result.data.plan)
        }
        if (result.data.valid) {
          toast.success(t('license.validated'))
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t('license.title')}
            </CardTitle>
            <CardDescription>
              {t('license.description')}
            </CardDescription>
          </div>
          {!licenseValid && (
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
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Label>{t('license.status')}</Label>
            {licenseValid ? (
              <Badge variant="default">{t('license.active')}</Badge>
            ) : (
              <Badge variant="secondary">{t('license.inactive')}</Badge>
            )}
            {initialCheckedAt && (
              <span className="text-xs text-muted-foreground">
                {t('license.lastChecked', { date: new Date(initialCheckedAt).toLocaleDateString() })}
              </span>
            )}
          </div>
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
          <p className="text-xs text-muted-foreground">
            {t('license.keyHint')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
