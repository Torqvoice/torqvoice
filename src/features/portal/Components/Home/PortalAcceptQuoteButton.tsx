'use client'

import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { respondToPortalQuote } from '../../Actions/respondToPortalQuote'
import { PortalButton, type PortalButtonVariant, PortalNotice } from '../Ui'

/**
 * "Accept quote" on the home, for every theme. Accepting tells the workshop
 * to go ahead, so the first press only asks: the button turns into a
 * sentence with "Yes, accept" and "Cancel" in its place (no dialog, so it
 * keeps the theme). Once accepted it says so and the page is read again,
 * which takes the quote off the home.
 *
 * Put it where the button goes; `children` are the buttons that sit beside
 * it (for example "Read the quote") and are hidden while it asks.
 */
export function PortalAcceptQuoteButton({
  quoteId,
  variant = 'accent',
  children,
}: {
  quoteId: string
  variant?: PortalButtonVariant
  children?: React.ReactNode
}) {
  const t = useTranslations('portal.quoteDetail')
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'asking' | 'sending' | 'accepted'>('idle')
  const [failed, setFailed] = useState(false)

  const accept = async () => {
    setState('sending')
    setFailed(false)
    const result = await respondToPortalQuote({ quoteId, answer: 'accepted' }).catch(() => ({
      success: false as const,
    }))
    if (!result.success) {
      // The server's reason is English; the customer reads their own language.
      setFailed(true)
      setState('asking')
      return
    }
    setState('accepted')
    router.refresh()
  }

  if (state === 'accepted') {
    return (
      <p role="status" className="flex min-h-[46px] items-center gap-2 text-[15px] font-semibold">
        <Check className="h-[18px] w-[18px] shrink-0" aria-hidden />
        {t('acceptedTitle')}
      </p>
    )
  }

  if (state === 'idle') {
    return (
      <div className="flex flex-wrap gap-2.5">
        <PortalButton variant={variant} onClick={() => setState('asking')}>
          {t('accept')}
        </PortalButton>
        {children}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[15px]">
        <span className="font-semibold">{t('confirmAcceptTitle')}</span>{' '}
        <span className="p-muted">{t('confirmAcceptBody')}</span>
      </p>
      {failed && (
        <PortalNotice tone="danger" role="alert">
          {t('answerFailed')}
        </PortalNotice>
      )}
      <div className="flex flex-wrap gap-2.5">
        <PortalButton variant={variant} pending={state === 'sending'} onClick={accept}>
          {t('confirmAcceptYes')}
        </PortalButton>
        <PortalButton
          variant="outline"
          disabled={state === 'sending'}
          onClick={() => setState('idle')}
        >
          {t('cancel')}
        </PortalButton>
      </div>
    </div>
  )
}
