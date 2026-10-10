'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  REAUTH_FRESH_SESSION_MINUTES,
  type ReauthRequirement,
  reauthErrorMessageKey,
} from '@/lib/reauth'

/**
 * The proof a destructive dialog asks for before the server will go ahead:
 * the password, a two-factor code, or (with neither on the account) a note
 * that only a recent sign-in will do. The server decides; this only shows the
 * field it is going to check, and its refusal.
 */
export function ReauthField({
  id,
  requirement,
  value,
  onChange,
  onSubmit,
  error,
}: {
  id: string
  requirement: ReauthRequirement
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  error: string | null
}) {
  const t = useTranslations('settings')
  const errorKey = reauthErrorMessageKey(error ?? undefined)

  return (
    <div className="space-y-2">
      {requirement === 'password' && (
        <>
          <Label htmlFor={id}>{t('account.reauthPasswordLabel')}</Label>
          <Input
            id={id}
            type="password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('account.enterPassword')}
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit?.()
            }}
          />
        </>
      )}
      {requirement === 'totp' && (
        <>
          <Label htmlFor={id}>{t('account.reauthTotpLabel')}</Label>
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('account.authCodePlaceholder')}
            autoComplete="one-time-code"
            className="tracking-widest"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit?.()
            }}
          />
        </>
      )}
      {requirement === 'none' && (
        <p className="text-sm text-muted-foreground">
          {t('account.reauthFreshSessionHint', { minutes: REAUTH_FRESH_SESSION_MINUTES })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {errorKey ? t(errorKey) : error}
        </p>
      )}
    </div>
  )
}
