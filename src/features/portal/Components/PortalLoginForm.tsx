'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Lock, Mail } from 'lucide-react'
import { PortalButton, PortalField, PortalInput, PortalNotice } from './Ui'

type PortalLoginFormProps = {
  orgId: string
  error?: string
  smsEnabled: boolean
  defaultCountryCode: string | null
}

/**
 * The sign-in itself, inside a theme's sign-in frame: a choice of email or
 * SMS when the workshop can send texts, one field and one button. Styled
 * only with the shared primitives, so it is right in every theme.
 */
export function PortalLoginForm({
  orgId,
  error,
  smsEnabled,
  defaultCountryCode,
}: PortalLoginFormProps) {
  const t = useTranslations('portal.login')
  const [method, setMethod] = useState<'email' | 'sms'>('email')

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <PortalNotice tone="danger" role="alert">
          {error}
        </PortalNotice>
      )}
      {smsEnabled && (
        <div className="p-segmented" role="group" aria-label={t('method')}>
          <button
            type="button"
            aria-pressed={method === 'email'}
            onClick={() => setMethod('email')}
          >
            {t('tabEmail')}
          </button>
          <button type="button" aria-pressed={method === 'sms'} onClick={() => setMethod('sms')}>
            {t('tabSms')}
          </button>
        </div>
      )}
      {method === 'sms' && smsEnabled ? (
        <SmsLoginForm orgId={orgId} defaultCountryCode={defaultCountryCode} />
      ) : (
        <EmailLoginForm orgId={orgId} />
      )}
    </div>
  )
}

/** "No password. We send you a link that signs you in." */
function Reassurance({ children }: { children: React.ReactNode }) {
  return (
    <p className="p-muted flex items-start gap-2.5 text-sm leading-[1.45]">
      <Lock className="mt-px h-[18px] w-[18px] shrink-0" aria-hidden />
      {children}
    </p>
  )
}

/**
 * Asks the server to send a sign-in link or code. The answer never says
 * whether an account exists, so success only means the request was taken;
 * what the customer is told about is the request itself failing: no
 * connection, too many tries, or the server erroring.
 */
type RequestOutcome = 'ok' | 'failed' | 'tooMany'

async function postSignInRequest(url: string, body: unknown): Promise<RequestOutcome> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 429) return 'tooMany'
    return res.ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <PortalNotice tone="danger" role="alert">
      {children}
    </PortalNotice>
  )
}

function EmailLoginForm({ orgId }: { orgId: string }) {
  const t = useTranslations('portal.login')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [problem, setProblem] = useState<Exclude<RequestOutcome, 'ok'> | null>(null)
  const [isPending, startTransition] = useTransition()
  const emailId = useId()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setProblem(null)
    startTransition(async () => {
      const outcome = await postSignInRequest(`/api/public/portal/${orgId}/auth/request`, {
        email,
      })
      if (outcome === 'ok') setSent(true)
      else setProblem(outcome)
    })
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-3" role="status">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-[var(--p-radius-control)] bg-[var(--p-soft)]"
        >
          <Mail className="h-6 w-6" />
        </span>
        <h3 className="p-display text-2xl">{t('checkEmail')}</h3>
        <p className="p-muted text-[15px] leading-normal">{t('checkEmailDescription')}</p>
        <PortalButton
          variant="outline"
          onClick={() => {
            setSent(false)
            setEmail('')
          }}
        >
          {t('tryDifferentEmail')}
        </PortalButton>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <PortalField label={t('emailLabel')} htmlFor={emailId}>
        <PortalInput
          id={emailId}
          type="email"
          size="lg"
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </PortalField>
      {problem && (
        <ErrorBox>{problem === 'tooMany' ? t('tooManyTries') : t('requestFailed')}</ErrorBox>
      )}
      <PortalButton type="submit" variant="accent" size="lg" block pending={isPending}>
        {problem ? t('tryAgain') : t('sendLink')}
      </PortalButton>
      <Reassurance>{t('noPassword')}</Reassurance>
    </form>
  )
}

/** How long "Send a new code" waits after a code went out. */
const RESEND_AFTER_MS = 30_000

function SmsLoginForm({
  orgId,
  defaultCountryCode,
}: {
  orgId: string
  defaultCountryCode: string | null
}) {
  const t = useTranslations('portal.login')
  const router = useRouter()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  // When a country code is set, `phone` holds only the local digits.
  // When not set, `phone` holds the full E.164 number the user types.
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [requestProblem, setRequestProblem] = useState<Exclude<RequestOutcome, 'ok'> | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [isRequestPending, startRequestTransition] = useTransition()
  const [isVerifyPending, startVerifyTransition] = useTransition()
  const phoneId = useId()
  const codeId = useId()

  // "Send a new code" waits a little after each code, so a slow text is not
  // answered with three more.
  useEffect(() => {
    if (step !== 'code' || canResend) return
    const timer = setTimeout(() => setCanResend(true), RESEND_AFTER_MS)
    return () => clearTimeout(timer)
  }, [step, canResend])

  // The full phone we send to the server. The server normalizes again as a
  // safety net, but pre-joining here makes the UI explicit about what's
  // being sent.
  const fullPhone = defaultCountryCode ? `${defaultCountryCode}${phone}` : phone

  const requestCode = (again: boolean) => {
    setRequestProblem(null)
    setVerifyError(null)
    setResent(false)
    startRequestTransition(async () => {
      const outcome = await postSignInRequest(`/api/public/portal/${orgId}/auth/sms-request`, {
        phone: fullPhone,
      })
      if (outcome !== 'ok') {
        setRequestProblem(outcome)
        return
      }
      setCanResend(false)
      if (again) setResent(true)
      setStep('code')
    })
  }

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault()
    requestCode(false)
  }

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault()
    setVerifyError(null)
    setRequestProblem(null)
    setResent(false)
    startVerifyTransition(async () => {
      try {
        const res = await fetch(`/api/public/portal/${orgId}/auth/sms-verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: fullPhone, code }),
        })
        if (res.status === 429) {
          setVerifyError(t('tooManyTries'))
          return
        }
        const data = (await res.json().catch(() => ({}))) as { success?: boolean }
        if (data.success) {
          router.push(`/portal/${orgId}/dashboard`)
          router.refresh()
          return
        }
        // The server's own words are English; the customer reads theirs.
        setVerifyError(res.status >= 500 ? t('requestFailed') : t('invalidCode'))
      } catch {
        setVerifyError(t('requestFailed'))
      }
    })
  }

  const requestMessage =
    requestProblem === 'tooMany'
      ? t('tooManyTries')
      : requestProblem === 'failed'
        ? t('requestFailed')
        : null

  if (step === 'code') {
    return (
      <form onSubmit={handleVerify} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h3 className="p-display text-2xl">{t('codeSentTitle')}</h3>
          <p className="p-muted text-[15px] leading-normal">
            {t('codeSentDescription', { phone: fullPhone })}
          </p>
        </div>
        <PortalField label={t('codeLabel')} htmlFor={codeId}>
          <PortalInput
            id={codeId}
            type="text"
            size="lg"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder={t('codePlaceholder')}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </PortalField>
        {verifyError && <ErrorBox>{verifyError}</ErrorBox>}
        {requestMessage && <ErrorBox>{requestMessage}</ErrorBox>}
        {resent && (
          <p role="status" className="p-muted text-sm">
            {t('newCodeSent')}
          </p>
        )}
        <PortalButton type="submit" variant="accent" size="lg" block pending={isVerifyPending}>
          {t('verifyCode')}
        </PortalButton>
        <div className="flex flex-wrap gap-2.5">
          <PortalButton
            variant="outline"
            className="flex-[1_1_180px]"
            disabled={!canResend}
            pending={isRequestPending}
            onClick={() => requestCode(true)}
          >
            {t('sendNewCode')}
          </PortalButton>
          <PortalButton
            variant="ghost"
            className="flex-[1_1_180px]"
            onClick={() => {
              setStep('phone')
              setCode('')
              setVerifyError(null)
              setRequestProblem(null)
              setResent(false)
            }}
          >
            {t('useDifferentPhone')}
          </PortalButton>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleRequest} className="flex flex-col gap-5">
      <PortalField label={t('phoneLabel')} htmlFor={phoneId}>
        {defaultCountryCode ? (
          <div className="p-input-group p-input-group--lg">
            <span className="p-input-group__prefix">{defaultCountryCode}</span>
            <PortalInput
              id={phoneId}
              type="tel"
              size="lg"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={t('phoneLocalPlaceholder')}
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))}
            />
          </div>
        ) : (
          <PortalInput
            id={phoneId}
            type="tel"
            size="lg"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t('phonePlaceholder')}
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        )}
      </PortalField>
      {requestMessage && <ErrorBox>{requestMessage}</ErrorBox>}
      <PortalButton type="submit" variant="accent" size="lg" block pending={isRequestPending}>
        {requestProblem ? t('tryAgain') : t('sendCode')}
      </PortalButton>
      <Reassurance>{t('noPasswordSms')}</Reassurance>
    </form>
  )
}
