'use client'

import { CheckCircle2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { checkPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/password-rules'
import { cn } from '@/lib/utils'

/**
 * The line under a new-password field that says, while the person types,
 * whether the server will take it. It states the rules in
 * `src/lib/password-rules.ts` and nothing else.
 *
 * The line is always rendered and keeps the height of its longest message,
 * so the form does not jump as the text changes. It is a polite live
 * region: point the input's `aria-describedby` at `id`. A password manager filling the field goes
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

  // Every message this line can show, laid under the visible one so the line
  // is always as tall as the longest of them at this width and in this
  // language. A long message that wraps then moves nothing below it.
  const sizers = [
    hint ? <Hint key="hint">{hint}</Hint> : null,
    <Hint key="short">{t('tooShort', { count: PASSWORD_MIN_LENGTH - 1 })}</Hint>,
    <Hint key="long">{t('tooLong', { count: 100, max: PASSWORD_MAX_LENGTH })}</Hint>,
    <Met key="ok">{t('ok')}</Met>,
  ]

  return (
    <Line id={id} className={className} sizers={sizers}>
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

  const sizers = [<Met key="match">{t('match')}</Met>, <Hint key="mismatch">{t('mismatch')}</Hint>]

  return (
    <Line id={id} className={className} sizers={sizers}>
      {content}
    </Line>
  )
}

/**
 * One grid cell holding the visible message and, invisibly, every message it
 * could show. The cell takes the height of the tallest. Only the visible
 * layer carries the id and the live region, so the input's description and
 * what a screen reader announces are the message alone.
 */
function Line({
  id,
  className,
  sizers,
  children,
}: {
  id: string
  className?: string
  sizers: ReactNode[]
  children: ReactNode
}) {
  const layer = 'col-start-1 row-start-1 flex min-h-4 items-start gap-1.5'
  return (
    <div className={cn('grid text-xs leading-4', className)}>
      {sizers.map((sizer, i) =>
        sizer ? (
          <div key={i} aria-hidden="true" className={cn(layer, 'invisible')}>
            {sizer}
          </div>
        ) : null
      )}
      <p id={id} aria-live="polite" className={layer}>
        {children}
      </p>
    </div>
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
        className="mt-px size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400"
      />
      <span className="font-medium text-emerald-700 dark:text-emerald-400">{children}</span>
    </>
  )
}
