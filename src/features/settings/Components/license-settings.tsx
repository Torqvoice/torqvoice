'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
          toast.success('License validated successfully')
        } else {
          toast.error('Invalid license key')
        }
        router.refresh()
      } else {
        toast.error(result.error ?? 'Failed to validate license')
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
              White-Label License
            </CardTitle>
            <CardDescription>
              Activate a white-label license to remove Torqvoice branding from invoices and the
              application.
            </CardDescription>
          </div>
          {!licenseValid && (
            <Button asChild variant="default" size="sm" className="shrink-0">
              <a
                href={`${process.env.NEXT_PUBLIC_TORQVOICE_COM_URL || 'https://torqvoice.com'}/subscriptions/white-label`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Purchase White-Label
                <ExternalLink className="ml-2 h-3 w-3" />
              </a>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Label>Status:</Label>
            {licenseValid ? (
              <Badge variant="default">Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
            {initialCheckedAt && (
              <span className="text-xs text-muted-foreground">
                Last checked: {new Date(initialCheckedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Enter license key"
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
              Validate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Each license key is tied to this organization and cannot be shared across multiple
            organizations.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
