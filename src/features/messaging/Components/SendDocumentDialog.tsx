'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Check, Copy, Link2, Loader2, Mail, MessageCircle, MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { handleGated } from '@/components/upgrade-gate'
import { useAttachPdf } from '@/features/email/Components/AttachPdfOption'
import { track } from '@/lib/analytics'
import type { GatedFeature } from '@/lib/with-auth'
import type { ShareChannelStatus } from '../Actions/getShareChannels'
import { sendInspectionLink, sendInvoiceLink, sendQuoteLink } from '../Actions/sendDocumentLink'
import { useShareChannels, useWhatsappReach } from '../Lib/useShareChannels'

export type SendDocumentKind = 'quote' | 'invoice' | 'inspection'

type SendResult = { success: boolean; error?: string; gated?: GatedFeature }

interface SendDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: SendDocumentKind
  documentId: string
  /** The document's link when it already has one, shown with a copy button. */
  shareUrl?: string | null
  customer?: {
    id: string
    name: string
    email: string | null
    phone: string | null
  } | null
  /** The page's own email action: each document builds its mail differently. */
  sendEmail: (to: string, message: string | undefined, attachPdf: boolean) => Promise<SendResult>
  /** Called once the document has actually gone out on at least one channel. */
  onSent?: () => void
}

const SEND_LINK = {
  quote: sendQuoteLink,
  invoice: sendInvoiceLink,
  inspection: sendInspectionLink,
} as const

const TITLE = {
  quote: 'titleQuote',
  invoice: 'titleInvoice',
  inspection: 'titleInspection',
} as const

/**
 * The one place a quote, an invoice or an inspection is sent from.
 *
 * Every channel carries the same thing, the document's link, so they sit in
 * one dialog as rows to tick. Each row's address or number starts as the
 * customer's and can be typed over, because a car often arrives before its
 * owner's details do. A channel the workshop has not set up is still shown,
 * disabled, with what to do about it.
 */
export function SendDocumentDialog({
  open,
  onOpenChange,
  kind,
  documentId,
  shareUrl,
  customer,
  sendEmail,
  onSent,
}: SendDocumentDialogProps) {
  const t = useTranslations('common.sendDocument')
  const ts = useTranslations('common.shareLink')
  const tb = useTranslations('common.buttons')
  const channels = useShareChannels(open)

  const [emailOn, setEmailOn] = useState(false)
  const [email, setEmail] = useState('')
  const [attachPdf, setAttachPdf] = useAttachPdf(open)
  const [smsOn, setSmsOn] = useState(false)
  const [smsTo, setSmsTo] = useState('')
  const [whatsappOn, setWhatsappOn] = useState(false)
  const [whatsappTo, setWhatsappTo] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  // Filled from the customer each time the dialog opens, so a number typed
  // for one send is not still there for the next.
  const customerEmail = customer?.email ?? ''
  const customerPhone = customer?.phone ?? ''
  useEffect(() => {
    if (!open) return
    setEmail(customerEmail)
    setEmailOn(customerEmail !== '')
    setSmsTo(customerPhone)
    setSmsOn(false)
    setWhatsappTo(customerPhone)
    setWhatsappOn(false)
    setMessage('')
  }, [open, customerEmail, customerPhone])

  const emailReady = channels?.email === 'ready'
  const smsReady = channels?.sms === 'ready'
  const whatsappSetUp = channels?.whatsapp === 'ready'
  // WhatsApp's 24 hour rule can be checked ahead only for the customer's own
  // number, where the conversation is on file. A typed number is tried, and
  // WhatsApp's answer is shown if it refuses.
  const toCustomerNumber = customerPhone !== '' && whatsappTo.trim() === customerPhone
  const whatsappReach = useWhatsappReach(open && whatsappSetUp && toCustomerNumber, customer?.id)
  const whatsappBlocked = toCustomerNumber && whatsappReach === false
  const whatsappReady = whatsappSetUp && !whatsappBlocked

  const wantsEmail = emailReady && emailOn && email.trim() !== ''
  const wantsSms = smsReady && smsOn && smsTo.trim() !== ''
  const wantsWhatsapp = whatsappReady && whatsappOn && whatsappTo.trim() !== ''
  const canSend = wantsEmail || wantsSms || wantsWhatsapp

  const handleCopy = () => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSend || sending) return
    setSending(true)

    const sent: string[] = []
    let failed = false
    // An action that cannot reach the server throws instead of answering, and
    // is told like any other failure so the other channels still get their go.
    const settle = (result: SendResult | null, done: string, fallback: string) => {
      if (result?.success) {
        sent.push(done)
        return true
      }
      failed = true
      if (!result || !handleGated(result)) toast.error(result?.error || fallback)
      return false
    }

    if (wantsEmail) {
      const result = await sendEmail(email.trim(), message.trim() || undefined, attachPdf).catch(
        () => null
      )
      if (settle(result, t('emailSent'), t('failedEmail'))) {
        track('document:email_send', { document: kind })
        setEmailOn(false)
      }
    }
    if (wantsSms) {
      const result = await SEND_LINK[kind]({
        id: documentId,
        channel: 'sms',
        to: smsTo.trim(),
      }).catch(() => null)
      if (settle(result, t('smsSent'), t('failedSms'))) setSmsOn(false)
    }
    if (wantsWhatsapp) {
      const result = await SEND_LINK[kind]({
        id: documentId,
        channel: 'whatsapp',
        to: whatsappTo.trim(),
      }).catch(() => null)
      if (settle(result, ts('whatsappSent'), ts('failedWhatsapp'))) setWhatsappOn(false)
    }

    if (sent.length > 0) {
      toast.success(sent.join(' & '))
      onSent?.()
    }
    setSending(false)
    // Done once everything ticked has gone. A channel that failed stays ticked
    // and the dialog stays open, so it can be tried again.
    if (sent.length > 0 && !failed) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSend} className="contents">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              {t(TITLE[kind])}
            </DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-3 rounded-lg border p-3">
              <ChannelRow
                id="send-email"
                icon={<Mail className="h-3.5 w-3.5" />}
                label={t('email')}
                checked={emailOn}
                onCheckedChange={setEmailOn}
                status={channels?.email}
                isCloud={channels?.isCloud ?? false}
                value={email}
                onValueChange={setEmail}
                // Checked as an address only while it is one being sent to: an
                // unticked row must not hold up the other channels.
                inputType={emailOn ? 'email' : 'text'}
                inputLabel={t('emailAddress')}
                placeholder={t('emailPlaceholder')}
              >
                <div className="flex items-center gap-2 pl-6">
                  <Checkbox
                    id="send-attach-pdf"
                    checked={attachPdf}
                    onCheckedChange={(v) => setAttachPdf(v === true)}
                    disabled={!emailReady || !emailOn}
                  />
                  <Label
                    htmlFor="send-attach-pdf"
                    className={`text-sm ${emailReady && emailOn ? '' : 'text-muted-foreground/50'}`}
                  >
                    {t('attachPdf')}
                  </Label>
                </div>
              </ChannelRow>
              <ChannelRow
                id="send-sms"
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label={t('sms')}
                checked={smsOn}
                onCheckedChange={setSmsOn}
                status={channels?.sms}
                isCloud={channels?.isCloud ?? false}
                value={smsTo}
                onValueChange={setSmsTo}
                inputType="tel"
                inputLabel={t('smsNumber')}
                placeholder={t('phonePlaceholder')}
              />
              <ChannelRow
                id="send-whatsapp"
                icon={<MessageCircle className="h-3.5 w-3.5" />}
                label={ts('whatsapp')}
                checked={whatsappOn}
                onCheckedChange={setWhatsappOn}
                status={channels?.whatsapp}
                isCloud={channels?.isCloud ?? false}
                value={whatsappTo}
                onValueChange={setWhatsappTo}
                inputType="tel"
                inputLabel={t('whatsappNumber')}
                placeholder={t('phonePlaceholder')}
                blockedReason={whatsappBlocked ? ts('whatsappWindowClosed') : null}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="send-message">{t('message')}</Label>
              <Textarea
                id="send-message"
                placeholder={t('messagePlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                disabled={!wantsEmail}
              />
            </div>

            {shareUrl && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-mono" title={shareUrl}>
                  {shareUrl}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleCopy}
                  aria-label={t('copyLink')}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tb('cancel')}
            </Button>
            <Button type="submit" disabled={sending || !canSend}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {t('send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface ChannelRowProps {
  id: string
  icon: ReactNode
  /** The channel's name as the workshop knows it: "SMS". */
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Undefined while the dialog is still asking. */
  status: ShareChannelStatus | undefined
  isCloud: boolean
  value: string
  onValueChange: (value: string) => void
  inputType: 'email' | 'tel' | 'text'
  inputLabel: string
  placeholder: string
  /** Why this recipient cannot be reached on a channel that otherwise works. */
  blockedReason?: string | null
  children?: ReactNode
}

/**
 * One channel: a tick, its name and who it goes to.
 *
 * Always drawn. A channel the workshop has not set up is disabled and says
 * what to do about it, with the way there: hidden, nobody found out that a
 * quote or an invoice could go out by text at all.
 */
function ChannelRow({
  id,
  icon,
  label,
  checked,
  onCheckedChange,
  status,
  isCloud,
  value,
  onValueChange,
  inputType,
  inputLabel,
  placeholder,
  blockedReason,
  children,
}: ChannelRowProps) {
  const t = useTranslations('common.shareLink')
  const tl = useTranslations('settings.featureLocked')

  const ready = status === 'ready'
  const usable = ready && !blockedReason
  const hintId = `${id}-hint`
  const hasHint =
    status === 'not_connected' ||
    status === 'not_in_plan' ||
    status === 'turned_off' ||
    !!blockedReason

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={usable && checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          disabled={!usable}
          aria-describedby={hasHint ? hintId : undefined}
        />
        <Label
          htmlFor={id}
          className={`flex w-24 shrink-0 items-center gap-1.5 text-sm ${usable ? '' : 'text-muted-foreground/50'}`}
        >
          {icon}
          {label}
        </Label>
        <Input
          type={inputType}
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value)
            // Typing who it goes to is choosing the channel. Judged on the
            // channel alone: a block on the old recipient says nothing about
            // the one being typed.
            if (ready && e.target.value.trim() !== '') onCheckedChange(true)
          }}
          placeholder={placeholder}
          id={`${id}-to`}
          aria-label={inputLabel}
          disabled={!ready}
          className="h-8 min-w-0 flex-1"
        />
      </div>
      {ready && blockedReason && (
        <p id={hintId} className="pl-6 text-xs text-muted-foreground">
          {blockedReason}
        </p>
      )}
      {status === 'not_connected' && (
        <p id={hintId} className="pl-6 text-xs text-muted-foreground">
          {t('channelNotConnected', { channel: label })}{' '}
          <Link href="/settings/integrations" className="font-medium text-primary hover:underline">
            {t('openIntegrations')}
          </Link>
        </p>
      )}
      {status === 'turned_off' && (
        <p id={hintId} className="pl-6 text-xs text-muted-foreground">
          {t('channelTurnedOff', { channel: label })}
        </p>
      )}
      {status === 'not_in_plan' && (
        <p id={hintId} className="pl-6 text-xs text-muted-foreground">
          {t('channelNotInPlan', { channel: label })}{' '}
          <Link
            href={isCloud ? '/settings/subscription' : '/settings/license'}
            className="font-medium text-primary hover:underline"
          >
            {isCloud ? tl('upgradePlan') : tl('activateLicense')}
          </Link>
        </p>
      )}
      {children}
    </div>
  )
}
