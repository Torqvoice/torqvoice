'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Mail } from 'lucide-react'

type PortalLoginFormProps = {
  orgId: string
  error?: string
  smsEnabled: boolean
}

export function PortalLoginForm({ orgId, error, smsEnabled }: PortalLoginFormProps) {
  const t = useTranslations('portal.login')

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('signInTitle')}</CardTitle>
        <CardDescription>{t('signInSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
            {error}
          </div>
        )}
        {smsEnabled ? (
          <Tabs defaultValue="email" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email">{t('tabEmail')}</TabsTrigger>
              <TabsTrigger value="sms">{t('tabSms')}</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="mt-4">
              <EmailLoginForm orgId={orgId} />
            </TabsContent>
            <TabsContent value="sms" className="mt-4">
              <SmsLoginForm orgId={orgId} />
            </TabsContent>
          </Tabs>
        ) : (
          <EmailLoginForm orgId={orgId} />
        )}
      </CardContent>
    </Card>
  )
}

function EmailLoginForm({ orgId }: { orgId: string }) {
  const t = useTranslations('portal.login')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      await fetch(`/api/public/portal/${orgId}/auth/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setSent(true)
    })
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
          <Mail className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold">{t('checkEmail')}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t('checkEmailDescription')}</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => {
            setSent(false)
            setEmail('')
          }}
        >
          {t('tryDifferentEmail')}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t('emailLabel')}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t('emailPlaceholder')}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t('sendLink')}
      </Button>
    </form>
  )
}

function SmsLoginForm({ orgId }: { orgId: string }) {
  const t = useTranslations('portal.login')
  const router = useRouter()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [isRequestPending, startRequestTransition] = useTransition()
  const [isVerifyPending, startVerifyTransition] = useTransition()

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault()
    setVerifyError(null)
    startRequestTransition(async () => {
      try {
        await fetch(`/api/public/portal/${orgId}/auth/sms-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        })
      } catch {
        // Ignore network errors and still advance to step 2; we don't want to
        // reveal whether the phone matched an account.
      }
      setStep('code')
    })
  }

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault()
    setVerifyError(null)
    startVerifyTransition(async () => {
      try {
        const res = await fetch(`/api/public/portal/${orgId}/auth/sms-verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean
          error?: string
        }
        if (data.success) {
          router.push(`/portal/${orgId}/dashboard`)
          router.refresh()
          return
        }
        setVerifyError(data.error || t('invalidCode'))
      } catch {
        setVerifyError(t('invalidCode'))
      }
    })
  }

  if (step === 'code') {
    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold">{t('codeSentTitle')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('codeSentDescription', { phone })}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sms-code">{t('codeLabel')}</Label>
          <Input
            id="sms-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder={t('codePlaceholder')}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        {verifyError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
            {verifyError}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={isVerifyPending}>
          {isVerifyPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('verifyCode')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setStep('phone')
            setCode('')
            setVerifyError(null)
          }}
        >
          {t('useDifferentPhone')}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={handleRequest} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sms-phone">{t('phoneLabel')}</Label>
        <Input
          id="sms-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t('phonePlaceholder')}
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isRequestPending}>
        {isRequestPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t('sendCode')}
      </Button>
    </form>
  )
}
