'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { signUp } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Gauge, Loader2, XCircle } from 'lucide-react'
import { acceptInvitation } from '@/features/team/Actions/acceptInvitation'

export function SignUpForm({ inviteToken, emailVerificationRequired }: { inviteToken?: string; emailVerificationRequired?: boolean }) {
  const t = useTranslations('auth.signUp')
  const tc = useTranslations('common')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await signUp.email({ name, email, password })
      if (result.error) {
        const message = result.error.message || t('errors.couldNotCreate')
        const isDisabled =
          message.toLowerCase().includes('disabled') ||
          message.toLowerCase().includes('failed to create')
        setError(
          isDisabled
            ? t('errors.registrationDisabled')
            : message,
        )
      } else if (inviteToken) {
        const acceptResult = await acceptInvitation({ token: inviteToken })
        if (acceptResult.success) {
          // Invited users have a known email — skip verification, go straight to dashboard
          router.push('/')
          router.refresh()
        } else {
          setError(acceptResult.error || t('errors.invitationFailed'))
          router.push('/onboarding')
          router.refresh()
        }
      } else if (emailVerificationRequired) {
        router.push('/auth/verify-email')
        router.refresh()
      } else {
        router.push('/onboarding')
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
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {inviteToken
              ? t('descriptionInvite')
              : t('descriptionDefault')}
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
            <Label htmlFor="name">{t('fullName')}</Label>
            <Input
              id="name"
              type="text"
              placeholder={t('fullNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-11 bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{tc('form.email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder={tc('form.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
              minLength={8}
              className="h-11 bg-background/50"
            />
          </div>

          <div className="flex items-start gap-2">
            <input
              id="terms"
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              required
              className="mt-1 h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor="terms" className="text-sm font-normal leading-snug text-muted-foreground">
              {t('agreeToTerms')}{' '}
              <Link href="/terms" target="_blank" className="font-medium text-primary hover:underline">
                {tc('terms.termsOfService')}
              </Link>
            </Label>
          </div>

          <Button type="submit" className="h-11 w-full" disabled={loading || !termsAccepted}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {inviteToken ? t('createAccountJoin') : t('createAccount')}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('alreadyHaveAccount')}{' '}
          <Link href="/auth/sign-in" className="font-medium text-primary hover:underline">
            {tc('buttons.signIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}
