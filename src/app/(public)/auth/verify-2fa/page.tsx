'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Gauge, Loader2, Shield, XCircle } from 'lucide-react'

export default function VerifyTwoFactorPage() {
  const t = useTranslations('auth.verify2fa')
  const tc = useTranslations('common')
  const [code, setCode] = useState('')
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [trustDevice, setTrustDevice] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError('')

    try {
      const result = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
        : await authClient.twoFactor.verifyTotp({ code, trustDevice })

      if (result.error) {
        setError(result.error.message || t('errors.invalidCode'))
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError(tc('errors.unexpected'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="glass relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
            <Gauge className="h-5 w-5 text-primary" />
            <span className="gradient-text text-sm font-bold tracking-wider uppercase">
              {tc('brandName')}
            </span>
          </div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {useBackupCode
              ? t('descriptionBackup')
              : t('descriptionTotp')}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">{useBackupCode ? t('backupCode') : t('authCode')}</Label>
            <Input
              id="code"
              type="text"
              inputMode={useBackupCode ? 'text' : 'numeric'}
              placeholder={useBackupCode ? t('backupCodePlaceholder') : t('totpPlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              autoComplete="one-time-code"
              className="h-11 bg-background/50 text-center text-lg tracking-widest"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="trust-device"
              checked={trustDevice}
              onCheckedChange={(checked) => setTrustDevice(checked === true)}
            />
            <Label htmlFor="trust-device" className="text-sm font-normal text-muted-foreground">
              {t('trustDevice')}
            </Label>
          </div>

          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('verify')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setUseBackupCode(!useBackupCode)
              setCode('')
              setError('')
            }}
            className="text-sm font-medium text-primary hover:underline"
          >
            {useBackupCode ? t('useAuthenticator') : t('useBackupCode')}
          </button>
        </div>
      </div>
    </div>
  )
}
