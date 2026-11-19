'use client'

import { CheckCircle2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { checkPassword, PASSWORD_MAX_LENGTH } from '@/lib/password-rules'
import { cn } from '@/lib/utils'

/**
 * The line under a new-password field that says, while the person types,
 * whether the server will take it. It states the rules in
 * `src/lib/password-rules.ts` and nothing else.
 *
 * The element is always rendered, one line tall, so the form does not jump
 * as the text changes, and it is a polite live region: point the input's
 * `aria-describedby` at `id`. A password manager filling the field goes
 * through the same `value`, so it gets the same answer.
 *
 * Not met yet is a hint in the muted colour, not an error: the person has
 * not finished typing. Met is a check icon and words, never colour alone.
 */
export function PasswordFeedback({
  id,
  password,
  hint,
  className,
}: {
  id: string
  password: string
  /** Shown while the field is empty, for a form that already states the rule up front. */
  hint?: ReactNode
  className?: string
}) {
  const t = useTranslations('common.passwordFeedback')
  const check = checkPassword(password)

  let content: ReactNode = hint ? <Hint>{hint}</Hint> : null
  if (check.status === 'tooShort') {
    content = <Hint>{t('tooShort', { count: check.remaining })}</Hint>
  } else if (check.status === 'tooLong') {
    content = <Hint>{t('tooLong', { count: check.over, max: PASSWORD_MAX_LENGTH })}</Hint>
  } else if (check.status === 'ok') {
    content = <Met>{t('ok')}</Met>
  }

  return (
    <Line id={id} className={className}>
      {content}
    </Line>
  )
}

/**
 * The same line under a confirm-password field: nothing until something is
 * typed in it, then whether it matches the password.
 */
export function PasswordMatchFeedback({
  id,
  password,
  confirmation,
  className,
}: {
  id: string
  password: string
  confirmation: string
  className?: string
}) {
  const t = useTranslations('common.passwordFeedback')

  let content: ReactNode = null
  if (confirmation.length > 0) {
    content = confirmation === password ? <Met>{t('match')}</Met> : <Hint>{t('mismatch')}</Hint>
  }

  return (
    <Line id={id} className={className}>
      {content}
    </Line>
  )
}

function Line({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: ReactNode
}) {
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn('flex min-h-4 items-center gap-1.5 text-xs leading-4', className)}
    >
      {children}
    </p>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}

function Met({ children }: { children: ReactNode }) {
  return (
    <>
      <CheckCircle2
        aria-hidden="true"
        className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400"
      />
      <span className="font-medium text-emerald-700 dark:text-emerald-400">{children}</span>
    </>
  )
}
