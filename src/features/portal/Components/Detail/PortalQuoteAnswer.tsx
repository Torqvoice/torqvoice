'use client'

import { Check, MessageSquare } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { respondToPortalQuote } from '../../Actions/respondToPortalQuote'
import {
  PortalButton,
  PortalField,
  PortalNotice,
  PortalPanel,
  PortalSectionLabel,
  PortalTextarea,
} from '../Ui'

type Answer = 'accepted' | 'changes_requested'

/**
 * The customer's answer to a quote, on the quote itself: accept it, or ask
 * for changes with a few words on what. Accepting is confirmed once, since it
 * tells the workshop to go ahead: the buttons turn into the question with
 * "Yes, accept" in their place (no dialog, so it keeps the portal's theme).
 * Once answered, the answer stands in place of the buttons, also when the
 * page is opened again later.
 */
export function PortalQuoteAnswer({
  quoteId,
  status,
  awaitsAnswer,
}: {
  quoteId: string
  status: string
  /** Sent, unanswered and still valid: the buttons show only then. */
  awaitsAnswer: boolean
}) {
  const t = useTranslations('portal.quoteDetail')
  const router = useRouter()
  const messageId = useId()
  const [answered, setAnswered] = useState<Answer | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'idle' | 'confirming' | 'asking'>('idle')
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState('')

  const send = async (answer: Answer) => {
    setBusy(true)
    setFailed(false)
    const result = await respondToPortalQuote({
      quoteId,
      answer,
      message: answer === 'changes_requested' ? message : undefined,
    }).catch(() => ({ success: false as const }))
    setBusy(false)
    if (!result.success) {
      // The server's reason is English; the customer reads their own language.
      // What they wrote stays, and so do the buttons.
      setFailed(true)
      if (answer === 'accepted') setMode('idle')
      return
    }
    setAnswered(answer)
    setMode('idle')
    setMessage('')
    // The status beside the title, and the lists this quote sits in.
    router.refresh()
  }

  const current = answered ?? status
  if (current === 'accepted' || current === 'changes_requested') {
    const accepted = current === 'accepted'
    const Icon = accepted ? Check : MessageSquare
    return (
      <PortalPanel tone="soft" role="status">
        <p className="flex items-center gap-2 text-base font-semibold">
          <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
          {accepted ? t('acceptedTitle') : t('changesTitle')}
        </p>
        <p className="p-muted mt-1 text-[15px]">
          {accepted ? t('acceptedBody') : t('changesBody')}
        </p>
      </PortalPanel>
    )
  }
  if (!awaitsAnswer) return null

  const problem = failed && (
    <PortalNotice tone="danger" role="alert">
      {t('answerFailed')}
    </PortalNotice>
  )

  return (
    <PortalPanel aria-labelledby={`${messageId}-title`}>
      <PortalSectionLabel id={`${messageId}-title`}>{t('answerLabel')}</PortalSectionLabel>
      <p className="mt-1.5 text-base font-semibold">{t('answerTitle')}</p>

      {mode === 'asking' ? (
        <div className="mt-4 flex flex-col gap-3">
          <PortalField label={t('changesLabel')} htmlFor={messageId}>
            <PortalTextarea
              id={messageId}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={t('changesPlaceholder')}
            />
          </PortalField>
          {problem}
          <div className="flex flex-col gap-2.5">
            <PortalButton
              variant="accent"
              block
              pending={busy}
              disabled={!message.trim()}
              onClick={() => send('changes_requested')}
            >
              {t('sendChanges')}
            </PortalButton>
            <PortalButton
              block
              disabled={busy}
              onClick={() => {
                setMode('idle')
                setMessage('')
                setFailed(false)
              }}
            >
              {t('cancel')}
            </PortalButton>
          </div>
        </div>
      ) : mode === 'confirming' ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[15px]">
            <span className="font-semibold">{t('confirmAcceptTitle')}</span>{' '}
            <span className="p-muted">{t('confirmAcceptBody')}</span>
          </p>
          <div className="flex flex-col gap-2.5">
            <PortalButton variant="accent" block pending={busy} onClick={() => send('accepted')}>
              {t('confirmAcceptYes')}
            </PortalButton>
            <PortalButton block disabled={busy} onClick={() => setMode('idle')}>
              {t('cancel')}
            </PortalButton>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {problem}
          <PortalButton
            variant="accent"
            block
            onClick={() => {
              setFailed(false)
              setMode('confirming')
            }}
          >
            <Check className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {t('accept')}
          </PortalButton>
          <PortalButton
            block
            onClick={() => {
              setFailed(false)
              setMode('asking')
            }}
          >
            <MessageSquare className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {t('askChanges')}
          </PortalButton>
        </div>
      )}
    </PortalPanel>
  )
}
