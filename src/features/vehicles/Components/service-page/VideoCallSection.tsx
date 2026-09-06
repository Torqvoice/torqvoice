'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Copy, ExternalLink, Loader2, Send, Trash2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-dialog'
import {
  createServiceMeeting,
  removeServiceMeeting,
  type ServiceVideoCall,
} from '@/features/integrations/Actions/integrationActions'
import { SendVideoCallDialog, type VideoCallRecipient } from './SendVideoCallDialog'

/**
 * The work order's video call, added on purpose.
 *
 * Nothing here happens on its own: a person presses the button, the meeting
 * is created at the provider, and the link lands on the work order. The
 * customer never receives it unless someone sends it, and the panel says
 * so, because a link that quietly appeared read as an invitation already
 * gone out. Sending is its own button, which opens a dialog that shows the
 * channels and the text before anything leaves.
 *
 * The actions on an existing link are anchors rather than buttons. The
 * column sits inside the form's fieldset, which is disabled once an invoice
 * is locked, and sending or copying a meeting link is not editing the
 * invoice.
 */
export function VideoCallSection({
  serviceRecordId,
  videoCall,
  scheduled,
  customer,
  smsEnabled = false,
  emailEnabled = false,
  telegramEnabled = false,
}: {
  serviceRecordId: string
  videoCall: ServiceVideoCall
  /** Whether the work order has a start time; a meeting follows the schedule. */
  scheduled: boolean
  /** Who the link would go to; null on a counter sale with nobody attached. */
  customer?: VideoCallRecipient | null
  smsEnabled?: boolean
  emailEnabled?: boolean
  telegramEnabled?: boolean
}) {
  const t = useTranslations('service.videoCall')
  const tp = useTranslations('integrations.meeting')
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const { link, providers } = videoCall
  const canSend = Boolean(customer) && (smsEnabled || emailEnabled || telegramEnabled)

  if (!link && providers.length === 0) return null

  const providerLabel = (key: string) => (tp.has(key) ? tp(key) : key)

  const add = async (connectorId: string) => {
    setBusy(true)
    try {
      const res = await createServiceMeeting(serviceRecordId, connectorId)
      if (!res.success) {
        toast.error(res.error || t('failed'))
        return
      }
      toast.success(t('created'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!link || busy) return
    const ok = await confirm({
      title: t('removeTitle'),
      description: t('removeDescription'),
      confirmLabel: t('remove'),
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await removeServiceMeeting(serviceRecordId, link.connectorId)
      if (!res.success) {
        toast.error(res.error || t('failed'))
        return
      }
      toast.success(t('removed'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success(t('copied'))
    } catch {
      toast.error(t('failed'))
    }
  }

  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault()
    fn()
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Video className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t('title')}</h3>
      </div>

      {link ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{providerLabel(link.provider)}</span>
            <span className="text-xs text-muted-foreground">
              {link.manual ? t('addedHere') : t('fromCalendar')}
            </span>
          </div>
          <code className="block select-all truncate rounded bg-muted px-2 py-1 text-xs">
            {link.url}
          </code>
          {/* One labelled action, icon buttons beside it, so the row fits a narrow column. */}
          <div className="flex items-center gap-1.5">
            {canSend ? (
              <Button size="sm" className="flex-1" asChild>
                <a href="#" role="button" onClick={act(() => setSendOpen(true))}>
                  <Send className="h-3.5 w-3.5" />
                  {t('send.button')}
                </a>
              </Button>
            ) : (
              <Button size="sm" className="flex-1" asChild>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('join')}
                </a>
              </Button>
            )}
            {canSend && (
              <Button size="icon-sm" variant="outline" asChild>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('join')}
                  aria-label={t('join')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button size="icon-sm" variant="outline" asChild>
              <a
                href="#"
                role="button"
                title={t('copy')}
                aria-label={t('copy')}
                onClick={act(() => void copy())}
              >
                <Copy className="h-3.5 w-3.5" />
              </a>
            </Button>
            {link.removable && (
              <Button
                size="icon-sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                asChild
              >
                <a
                  href="#"
                  role="button"
                  title={t('remove')}
                  aria-label={t('remove')}
                  aria-disabled={busy}
                  onClick={act(() => void remove())}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </a>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {canSend ? t('shareHint') : t('shareHintNoChannel')}
          </p>
          {customer && (
            <SendVideoCallDialog
              open={sendOpen}
              onOpenChange={setSendOpen}
              serviceRecordId={serviceRecordId}
              meetingUrl={link.url}
              customer={customer}
              smsEnabled={smsEnabled}
              emailEnabled={emailEnabled}
              telegramEnabled={telegramEnabled}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {scheduled ? t('none') : t('needsSchedule')}
          </p>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <Button
                key={p.connectorId}
                size="sm"
                variant="outline"
                onClick={() => add(p.connectorId)}
                disabled={busy || !scheduled}
              >
                {busy ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Video className="mr-1 h-3.5 w-3.5" />
                )}
                {t('add', { provider: p.name })}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
