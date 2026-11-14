'use client'

import { useEffect, useId, useState } from 'react'
import { Check, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { sendWhatsNewFeedback } from '../Actions/sendWhatsNewFeedback'

type Vote = 'up' | 'down'

const STORAGE_KEY = 'torqvoice.whatsNew.votes'

/** This browser's memory of what was voted, so the thumb stays lit next time. */
function readVotes(): Record<string, Vote> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function rememberVote(entryId: string, vote: Vote) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readVotes(), [entryId]: vote }))
  } catch {
    // Private window, or storage switched off. The vote itself was sent.
  }
}

/**
 * "Was this useful?" under a highlight.
 *
 * The thumb is the whole answer and is sent the moment it is pressed. The
 * comment box that opens under it is an invitation, not a second step: most
 * people will not type anything, and their vote must not depend on it.
 *
 * A bare thumb names nobody, anywhere. Only a comment from the cloud carries
 * the sender's email, and the line under the box says so before Send.
 */
export function WhatsNewFeedback({
  entryId,
  identified,
}: {
  entryId: string
  /** Whether the sender's email goes along (the cloud) or nothing does. */
  identified: boolean
}) {
  const t = useTranslations('common.whatsNew.feedback')
  const commentId = useId()
  const [vote, setVote] = useState<Vote | null>(null)
  const [writing, setWriting] = useState(false)
  const [comment, setComment] = useState('')
  // One request at a time. A slow first vote that fails must not arrive
  // after a second one succeeded and take the thumb back.
  const [busy, setBusy] = useState(false)
  const [commentSent, setCommentSent] = useState(false)

  useEffect(() => {
    setVote(readVotes()[entryId] ?? null)
  }, [entryId])

  async function cast(next: Vote) {
    if (busy) return
    setBusy(true)
    const previous = vote
    setVote(next)
    setWriting(true)
    setCommentSent(false)
    const result = await sendWhatsNewFeedback({ entryId, vote: next })
    setBusy(false)
    if (result.success) {
      rememberVote(entryId, next)
    } else {
      setVote(previous)
      setWriting(false)
      toast.error(t('failed'))
    }
  }

  async function sendComment() {
    if (busy || !vote || !comment.trim()) return
    setBusy(true)
    const result = await sendWhatsNewFeedback({ entryId, vote, comment })
    setBusy(false)
    if (!result.success) {
      toast.error(t('failed'))
      return
    }
    setComment('')
    setWriting(false)
    setCommentSent(true)
  }

  const thumb = (which: Vote) =>
    cn(
      'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      vote === which
        ? 'bg-primary/15 text-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    )

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs text-muted-foreground">{t('question')}</span>
        <button
          type="button"
          onClick={() => cast('up')}
          disabled={busy}
          aria-pressed={vote === 'up'}
          aria-label={t('up')}
          title={t('up')}
          className={thumb('up')}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => cast('down')}
          disabled={busy}
          aria-pressed={vote === 'down'}
          aria-label={t('down')}
          title={t('down')}
          className={thumb('down')}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
        {commentSent && (
          <span
            className="ml-1 flex items-center gap-1 text-xs text-muted-foreground"
            role="status"
          >
            <Check className="h-3.5 w-3.5" />
            {t('thanks')}
          </span>
        )}
      </div>
      {writing && vote && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <label htmlFor={commentId} className="text-xs font-medium">
            {vote === 'down' ? t('askDown') : t('askUp')}
          </label>
          <Textarea
            id={commentId}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
            rows={3}
            className="min-h-20 bg-background"
          />
          <p className="text-xs leading-snug text-muted-foreground">
            {identified ? t('privacyIdentified') : t('privacyAnonymous')}
          </p>
          <div className="flex items-center justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setWriting(false)}>
              {t('skip')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={sendComment}
              disabled={busy || !comment.trim()}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('send')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
