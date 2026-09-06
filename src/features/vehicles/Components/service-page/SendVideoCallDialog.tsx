'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Mail, MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { sendServiceVideoCall } from '@/features/integrations/Actions/videoCallActions'

export interface VideoCallRecipient {
  name: string
  email: string | null
  phone: string | null
  telegramChatId: string | null
}

/**
 * Sending the video call link is a deliberate act: pick the channels, read
 * what goes out, press Send. The link itself is always appended, so a note
 * typed here cannot lose it.
 */
export function SendVideoCallDialog({
  open,
  onOpenChange,
  serviceRecordId,
  meetingUrl,
  customer,
  smsEnabled,
  emailEnabled,
  telegramEnabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceRecordId: string
  meetingUrl: string
  customer: VideoCallRecipient
  smsEnabled: boolean
  emailEnabled: boolean
  telegramEnabled: boolean
}) {
  const t = useTranslations('service.videoCall.send')
  const [message, setMessage] = useState('')
  const [sms, setSms] = useState(false)
  const [email, setEmail] = useState(false)
  const [telegram, setTelegram] = useState(false)
  const [sending, setSending] = useState(false)

  const canSms = smsEnabled && Boolean(customer.phone)
  const canEmail = emailEnabled && Boolean(customer.email)
  const canTelegram = telegramEnabled && Boolean(customer.telegramChatId)
  const anyChosen = sms || email || telegram

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setMessage('')
      // One channel the customer can actually be reached on starts ticked,
      // so the common case is read, then Send.
      setEmail(canEmail)
      setSms(!canEmail && canSms)
      setTelegram(!canEmail && !canSms && canTelegram)
    }
    onOpenChange(next)
  }

  const send = async () => {
    if (!anyChosen) return
    setSending(true)
    try {
      const res = await sendServiceVideoCall({
        serviceRecordId,
        channels: { sms, email, telegram },
        customMessage: message.trim() || undefined,
      })
      if (!res.success) {
        toast.error(res.error || t('failed'))
        return
      }
      const failed = res.data?.failures ?? []
      if (failed.length > 0) {
        toast.warning(
          t('partlySent', {
            sent: (res.data?.channels ?? []).map((c) => t(c)).join(', '),
            failed: failed.map((f) => t(f.channel)).join(', '),
          })
        )
      } else {
        toast.success(t('sent'))
      }
      onOpenChange(false)
    } finally {
      setSending(false)
    }
  }

  const channelRow = (
    id: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    enabled: boolean,
    hasAddress: boolean,
    icon: React.ReactNode,
    label: string,
    missing: string
  ) => (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={!enabled || !hasAddress}
      />
      <Label
        htmlFor={id}
        className={`flex items-center gap-1.5 text-sm ${!enabled || !hasAddress ? 'text-muted-foreground/50' : ''}`}
      >
        {icon}
        {label}
        {!hasAddress && <span className="text-xs">{missing}</span>}
        {hasAddress && !enabled && <span className="text-xs">{t('notAvailable')}</span>}
      </Label>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: customer.name })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {channelRow(
              'video-call-email',
              email,
              setEmail,
              emailEnabled,
              Boolean(customer.email),
              <Mail className="h-3.5 w-3.5" />,
              t('email'),
              t('noEmail')
            )}
            {channelRow(
              'video-call-sms',
              sms,
              setSms,
              smsEnabled,
              Boolean(customer.phone),
              <MessageSquare className="h-3.5 w-3.5" />,
              t('sms'),
              t('noPhone')
            )}
            {channelRow(
              'video-call-telegram',
              telegram,
              setTelegram,
              telegramEnabled,
              Boolean(customer.telegramChatId),
              <Send className="h-3.5 w-3.5" />,
              t('telegram'),
              t('noTelegram')
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="video-call-message" className="text-sm">
              {t('messageLabel')}
            </Label>
            <Textarea
              id="video-call-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('messagePlaceholder')}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{t('linkAlwaysIncluded')}</p>
            <code className="block truncate rounded bg-muted px-2 py-1 text-xs">{meetingUrl}</code>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              {t('cancel')}
            </Button>
            <Button onClick={send} disabled={!anyChosen || sending}>
              {sending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              {t('send')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
