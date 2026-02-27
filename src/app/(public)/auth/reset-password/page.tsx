'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Gauge, Loader2, XCircle } from 'lucide-react'

function ResetPasswordInner() {
  const t = useTranslations('auth.resetPassword')
  const tc = useTranslations('common')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError(t('errors.passwordsMismatch'))
      return
    }

    if (newPassword.length < 8) {
      setError(t('errors.passwordTooShort'))
      return
    }

    setLoading(true)

    try {
      const result = await authClient.resetPassword({
        newPassword,
        token,
      })

      if (result.error) {
        setError(result.error.message || t('errors.resetFailed'))
      } else {
        setSuccess(true)
      }
    } catch {
      setError(tc('errors.unexpected'))
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          {t('invalidToken')}
        </p>
        <Link href="/auth/forgot-password">
          <Button variant="outline" className="h-11 w-full">
            {t('requestNewLink')}
          </Button>
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          {t('successMessage')}
        </p>
        <Link href="/auth/sign-in">
          <Button className="h-11 w-full">{tc('buttons.signIn')}</Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">{t('newPassword')}</Label>
          <Input
            id="new-password"
            type="password"
            placeholder={t('newPasswordPlaceholder')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="h-11 bg-background/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
          <Input
            id="confirm-password"
            type="password"
            placeholder={t('confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="h-11 bg-background/50"
          />
        </div>

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('resetButton')}
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  const t = useTranslations('auth.resetPassword')
  const tc = useTranslations('common')

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
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>

        <Suspense>
          <ResetPasswordInner />
        </Suspense>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/auth/sign-in" className="font-medium text-primary hover:underline">
            {t('backToSignIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}
