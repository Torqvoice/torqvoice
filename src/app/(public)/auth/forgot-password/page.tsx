'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Gauge, Loader2, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgotPassword')
  const tc = useTranslations('common')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: '/auth/reset-password',
      })
    } catch {
      // Silently handle - don't reveal whether the email exists
    } finally {
      setLoading(false)
      setSent(true)
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
            {t('description')}
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              {t('successMessage')}
            </p>
            <Link href="/auth/sign-in" className="block">
              <Button variant="outline" className="h-11 w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('backToSignIn')}
              </Button>
            </Link>
          </div>
        ) : (
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
                className="h-11 bg-background/50"
              />
            </div>

            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('sendResetLink')}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/auth/sign-in" className="font-medium text-primary hover:underline">
            {t('backToSignIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}
