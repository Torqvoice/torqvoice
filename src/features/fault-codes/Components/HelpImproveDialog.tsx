'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link2, Loader2, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { sendFaultCodeFeedback } from '../Actions/sendFaultCodeFeedback'
import { IMPROVE_TOPICS, MAX_IMPROVE_TEXT } from '../Schema/faultCodeSchema'

type Topic = (typeof IMPROVE_TOPICS)[number]

/** The sites the pasted links point to, each once, so the sender sees they were understood. */
function linkHosts(text: string): string[] {
  const hosts = new Set<string>()
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    try {
      hosts.add(new URL(match[0]).hostname.replace(/^www\./, ''))
    } catch {
      // Not a link after all.
    }
  }
  return [...hosts]
}

/**
 * "Help us improve" for fault codes: where a make's codes are published, a meaning that is
 * wrong, a link worth reading, or an idea, written or pasted in a few words and mailed to the
 * Torqvoice team. A topic is a tap and optional; the code on screen goes with it unless taken
 * off. What was written stays when the dialog is closed, until it is sent.
 */
export function HelpImproveDialog({
  open,
  onOpenChange,
  code = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The code on screen as people read it ("BMW 2A82"); null on the lookup page. */
  code?: string | null
}) {
  const t = useTranslations('faultCodes.improve')
  const [topic, setTopic] = useState<Topic | null>(null)
  const [message, setMessage] = useState('')
  const [withCode, setWithCode] = useState(true)
  const [sending, setSending] = useState(false)
  const hosts = linkHosts(message)
  const tooLong = message.length > MAX_IMPROVE_TEXT

  const send = async () => {
    if (!message.trim() || tooLong || sending) return
    setSending(true)
    const result = await sendFaultCodeFeedback({
      topic: topic ?? undefined,
      message: message.trim(),
      code: withCode && code ? code : undefined,
      page: window.location.pathname,
    }).catch(() => null)
    setSending(false)
    if (result?.success && result.data?.sent) {
      track('fault_code:improve_send', {
        topic: topic ?? null,
        with_code: Boolean(withCode && code),
        links: hosts.length,
      })
      toast.success(t('sent'))
      setTopic(null)
      setMessage('')
      setWithCode(true)
      onOpenChange(false)
      return
    }
    // What was written stays, ready to try again.
    if (result?.success && result.data?.reason === 'limited') toast.error(t('errors.limited'))
    else toast.error(t('errors.failed'))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="space-y-2">
            <span className="text-sm font-medium">{t('topic')}</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('topic')}>
              {IMPROVE_TOPICS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={topic === k}
                  onClick={() => setTopic((now) => (now === k ? null : k))}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    topic === k
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40'
                  )}
                >
                  {t(`topics.${k}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="improve-message" className="text-sm font-medium">
                {t('message')}
              </Label>
              {message.length > MAX_IMPROVE_TEXT * 0.8 && (
                <span
                  className={cn(
                    'text-xs tabular-nums text-muted-foreground',
                    tooLong && 'font-medium text-destructive'
                  )}
                >
                  {message.length} / {MAX_IMPROVE_TEXT}
                </span>
              )}
            </div>
            <Textarea
              id="improve-message"
              value={message}
              rows={6}
              placeholder={t(`placeholders.${topic ?? 'idea'}`)}
              onChange={(e) => setMessage(e.target.value)}
            />
            {hosts.length > 0 && (
              <ul className="flex flex-wrap items-center gap-1.5" aria-label={t('links')}>
                {hosts.map((host) => (
                  <li
                    key={host}
                    className="inline-flex items-center gap-1 rounded-full border border-card-edge bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    <Link2 className="size-3" aria-hidden />
                    {host}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {code && withCode && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-card-edge bg-muted/30 px-3 py-2 text-sm">
              <span>{t('about', { code })}</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={() => setWithCode(false)}
              >
                <X />
                {t('leaveOut')}
              </Button>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{t('replyHint')}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={sending}
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              disabled={!message.trim() || tooLong || sending}
              onClick={() => void send()}
            >
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              {t('send')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
