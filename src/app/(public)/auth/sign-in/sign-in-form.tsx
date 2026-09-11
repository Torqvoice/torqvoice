'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { signIn, authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Fingerprint, Loader2, PlayCircle, XCircle } from 'lucide-react'
import { AuthLogo } from '@/components/auth-logo'
import { AuthCard, AuthShell } from '@/components/auth/auth-shell'
import { GoogleMark } from '@/components/auth/google-mark'
import { TERMS_URL } from '@/lib/marketing-urls'

const DEMO_EMAIL = 'demo@torqvoice.com'
const DEMO_PASSWORD = 'demo'

function SignInFormInner({
  registrationDisabled,
  demoMode = false,
  pitch,
  googleEnabled = false,
}: {
  registrationDisabled: boolean
  demoMode?: boolean
  pitch: boolean
  googleEnabled?: boolean
}) {
  const t = useTranslations('auth.signIn')
  const tc = useTranslations('common')
  const tSocial = useTranslations('auth.social')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Better Auth sends a failed Google round-trip back here with ?error=...
  const [error, setError] = useState(() => (searchParams.get('error') ? tSocial('failed') : ''))
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  const redirectParam = searchParams.get('redirect')
  const signUpHref = `/auth/sign-up${
    redirectParam ? `?redirect=${encodeURIComponent(safeRedirectPath(redirectParam))}` : ''
  }`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await signIn.email({ email, password })
      if (result.error) {
        // The origin refusal carries both addresses, see lib/auth-origin-hint.
        const refusal = result.error as { code?: string; origin?: string; configured?: string }
        if (result.error.status === 429) {
          setError(t('errors.tooManyAttempts'))
        } else if (refusal.code === 'INVALID_ORIGIN' && refusal.origin && refusal.configured) {
          setError(
            t('errors.invalidOrigin', { origin: refusal.origin, configured: refusal.configured })
          )
        } else {
          setError(result.error.message || t('errors.invalidCredentials'))
        }
        // Clear password and refocus so the retry is one keystroke away
        setPassword('')
        passwordRef.current?.focus()
      } else {
        router.push(safeRedirectPath(redirectParam))
        router.refresh()
      }
    } catch {
      setError(tc('errors.unexpected'))
    } finally {
      setLoading(false)
    }
  }

  const handleDemoSignIn = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await signIn.email({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      if (result.error) {
        setError(result.error.message || tc('errors.unexpected'))
        setLoading(false)
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError(tc('errors.unexpected'))
      setLoading(false)
    }
  }

  // Auto-sign-in when arriving with ?demo=1 (deep-link from marketing site)
  const autoTriggered = useRef(false)
  useEffect(() => {
    if (!demoMode || autoTriggered.current) return
    if (searchParams.get('demo') !== '1') return
    autoTriggered.current = true
    void handleDemoSignIn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, searchParams])

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    setError('')
    try {
      const target = safeRedirectPath(redirectParam)
      await signIn.social({
        provider: 'google',
        callbackURL: target,
        // A first-time Google user has no workshop yet. Existing users go
        // where they were headed; a same-email password account is linked
        // on the way, so they are an existing user too.
        newUserCallbackURL:
          target !== '/' ? `/onboarding?redirect=${encodeURIComponent(target)}` : '/onboarding',
        errorCallbackURL: '/auth/sign-in',
      })
    } catch {
      setError(tSocial('failed'))
      setGoogleLoading(false)
    }
  }

  const handlePasskeySignIn = async () => {
    setPasskeyLoading(true)
    setError('')
    try {
      const result = await authClient.signIn.passkey()
      if (result?.error) {
        // User dismissed the passkey prompt — not an error state
        if ('code' in result.error && result.error.code === 'AUTH_CANCELLED') return
        const msg = typeof result.error.message === 'string' ? result.error.message : ''
        setError(msg || t('errors.passkeyFailed'))
      } else {
        router.push(safeRedirectPath(redirectParam))
        router.refresh()
      }
    } catch {
      setError(t('errors.passkeyFailed'))
    } finally {
      setPasskeyLoading(false)
    }
  }

  return (
    <AuthCard>
      <div className={pitch ? 'mb-6 text-center lg:text-left' : 'mb-8 text-center'}>
        <div className={`mb-4 inline-flex items-center gap-2 ${pitch ? 'lg:hidden' : ''}`}>
          <AuthLogo alt={tc('brandName')} />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        {/*
          Most people who land here from the marketing site have no account
          yet: they clicked "Login" because it was the only button in the
          header. The way to a free account goes above the form, where they
          read, not under the passkey button, where they do not.
        */}
        {!registrationDisabled && (
          <p className="mt-3 text-sm text-muted-foreground">
            {pitch ? t('newHere') : t('noAccount')}{' '}
            <Link href={signUpHref} className="font-medium text-primary hover:underline">
              {pitch ? t('createFreeAccount') : t('createOne')}
            </Link>
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{error}</p>
            <p className="mt-1 text-xs">
              {t('forgotPassword')}{' '}
              <Link href="/auth/forgot-password" className="font-medium underline">
                {t('resetPasswordCta')}
              </Link>
            </p>
          </div>
        </div>
      )}

      {googleEnabled && !demoMode && (
        <div className="mb-5">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full text-base"
            disabled={googleLoading || loading}
            onClick={handleGoogleSignIn}
          >
            {googleLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GoogleMark className="mr-2 h-4.5 w-4.5" />
            )}
            {tSocial('google')}
          </Button>
          <div className="relative mt-5">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background/50 px-2 text-muted-foreground">
                {tSocial('orEmail')}
              </span>
            </div>
          </div>
        </div>
      )}

      {demoMode && (
        <div className="mb-6">
          <Button
            type="button"
            className="h-11 w-full"
            disabled={loading}
            onClick={handleDemoSignIn}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 h-4 w-4" />
            )}
            Try the demo
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Or sign in manually with <code className="rounded bg-muted px-1">{DEMO_EMAIL}</code> /{' '}
            <code className="rounded bg-muted px-1">{DEMO_PASSWORD}</code>
          </p>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
          </div>
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{tc('form.password')}</Label>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {t('forgotPassword')}
            </Link>
          </div>
          <Input
            ref={passwordRef}
            id="password"
            type="password"
            placeholder={t('passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="h-11 bg-background/50"
          />
        </div>

        <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {tc('buttons.signIn')}
        </Button>
      </form>

      <div className="relative my-5">
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
        className="h-10 w-full"
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

      <p className="mt-5 text-center text-xs text-muted-foreground">
        {t('termsAgreement')}{' '}
        <a href={TERMS_URL} target="_blank" rel="noopener" className="text-primary hover:underline">
          {tc('terms.termsOfService')}
        </a>
      </p>
    </AuthCard>
  )
}

export function SignInForm({
  registrationDisabled,
  demoMode = false,
  cloudMode = false,
  googleEnabled = false,
}: {
  registrationDisabled: boolean
  demoMode?: boolean
  cloudMode?: boolean
  googleEnabled?: boolean
}) {
  // The demo instance runs in cloud mode too, but its visitors came for the
  // demo button, not for a sales pitch beside it.
  const pitch = cloudMode && !demoMode

  return (
    <AuthShell pitch={pitch}>
      <Suspense>
        <SignInFormInner
          registrationDisabled={registrationDisabled}
          demoMode={demoMode}
          pitch={pitch}
          googleEnabled={googleEnabled}
        />
      </Suspense>
    </AuthShell>
  )
}
