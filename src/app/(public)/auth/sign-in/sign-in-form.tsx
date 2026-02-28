'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { signIn, authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Fingerprint, Gauge, Loader2, XCircle } from 'lucide-react'

function SignInFormInner({ registrationDisabled }: { registrationDisabled: boolean }) {
  const t = useTranslations('auth.signIn')
  const tc = useTranslations('common')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await signIn.email({ email, password })
      if (result.error) {
        if (result.error.status === 429) {
          setError(t('errors.tooManyAttempts'))
        } else if (
          result.error.status === 403 &&
          result.error.message?.toLowerCase().includes('email')
        ) {
          router.push('/auth/verify-email')
          router.refresh()
          return
        } else {
          setError(result.error.message || t('errors.invalidCredentials'))
        }
      } else {
        const redirect = searchParams.get('redirect') || '/'
        router.push(redirect)
        router.refresh()
      }
    } catch {
      setError(tc('errors.unexpected'))
    } finally {
      setLoading(false)
    }
  }

  const handlePasskeySignIn = async () => {
    setPasskeyLoading(true)
    setError('')
    try {
      const result = await authClient.signIn.passkey()
      if (result?.error) {
        setError(result.error.message || t('errors.passkeyFailed'))
      } else {
        const redirect = searchParams.get('redirect') || '/'
        router.push(redirect)
        router.refresh()
      }
    } catch {
      setError(t('errors.passkeyFailed'))
    } finally {
      setPasskeyLoading(false)
    }
  }

  return (
    <div className="glass relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
          <Gauge className="h-5 w-5 text-primary" />
          <span className="gradient-text text-sm font-bold tracking-wider uppercase">
            {tc('brandName')}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{tc('form.email')}</Label>
          <Input
            id="email"
            type="email"
            placeholder={tc('form.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username webauthn"
            className="h-11 bg-background/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{tc('form.password')}</Label>
          <Input
            id="password"
            type="password"
            placeholder={t('passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 bg-background/50"
          />
          <div className="flex justify-end">
            <Link href="/auth/forgot-password" className="text-xs text-muted-foreground hover:underline">
              {t('forgotPassword')}
            </Link>
          </div>
        </div>

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {tc('buttons.signIn')}
        </Button>
      </form>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background/50 px-2 text-muted-foreground">{t('or')}</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        disabled={passkeyLoading}
        onClick={handlePasskeySignIn}
      >
        {passkeyLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Fingerprint className="mr-2 h-4 w-4" />
        )}
        {t('passkey')}
      </Button>

      {!registrationDisabled && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('noAccount')}{' '}
          <Link href="/auth/sign-up" className="font-medium text-primary hover:underline">
            {t('createOne')}
          </Link>
        </p>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {t('termsAgreement')}{' '}
        <Link href="/terms" target="_blank" className="text-primary hover:underline">
          {tc('terms.termsOfService')}
        </Link>
      </p>
    </div>
  )
}

export function SignInForm({ registrationDisabled }: { registrationDisabled: boolean }) {
  return (
    <div className="grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <Suspense>
        <SignInFormInner registrationDisabled={registrationDisabled} />
      </Suspense>
    </div>
  )
}
