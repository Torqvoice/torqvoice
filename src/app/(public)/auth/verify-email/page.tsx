'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { authClient, signOut, useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Gauge, Loader2, Mail, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCooldown } from '@/hooks/use-cooldown'

export default function VerifyEmailPage() {
  const t = useTranslations('auth.verifyEmail')
  const tc = useTranslations('common')
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, startCooldown] = useCooldown('verify-email', 60)
  const router = useRouter()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll for email verification status every 5 seconds
  useEffect(() => {
    const checkVerification = async () => {
      try {
        const { data } = await authClient.getSession({
          query: { disableCookieCache: true },
        })
        if (data?.user?.emailVerified) {
          router.push('/')
          router.refresh()
        }
      } catch {
        // silently handle
      }
    }

    pollRef.current = setInterval(checkVerification, 5000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [router])

  const handleResend = useCallback(async () => {
    if (cooldown > 0) return
    setLoading(true)
    try {
      await authClient.sendVerificationEmail({
        email: session?.user?.email ?? '',
        callbackURL: '/',
      })
      setSent(true)
      startCooldown()
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }, [cooldown, session?.user?.email, startCooldown])

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/sign-in')
  }

  const email = session?.user?.email ?? ''

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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('description', { email })}
          </p>
        </div>

        <div className="space-y-4">
          {sent && cooldown > 0 ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-700 dark:text-emerald-400">
                {t('resent')}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {t('resendCooldown', { seconds: cooldown })}
              </p>
            </div>
          ) : (
            <Button
              onClick={handleResend}
              className="h-11 w-full"
              disabled={loading || cooldown > 0}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              {cooldown > 0
                ? t('resendCooldown', { seconds: cooldown })
                : t('resend')}
            </Button>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {t('checkSpam')}
          </p>

          <Button
            variant="ghost"
            className="h-11 w-full"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t('signOut')}
          </Button>
        </div>
      </div>
    </div>
  )
}
