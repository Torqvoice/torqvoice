'use client'

import { track } from '@/lib/analytics'
import { handleGated } from '@/components/upgrade-gate'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Check, Copy, Link2, Loader2, Mail, MessageCircle, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import {
  generateQuotePublicLink,
  revokeQuotePublicLink,
} from '@/features/quotes/Actions/quoteShareActions'
import { sendQuoteEmail } from '@/features/email/Actions/emailActions'
import { sendSmsToCustomer, getSmsTemplates } from '@/features/sms/Actions/smsActions'
import { NotifyChannelOption } from '@/features/messaging/Components/NotifyChannelOption'
import { useShareChannels, useWhatsappReach } from '@/features/messaging/Lib/useShareChannels'
import { sendWhatsappToCustomer } from '@/features/whatsapp/Actions/whatsappActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from '@/lib/sms-templates'
import { AttachPdfOption, useAttachPdf } from '@/features/email/Components/AttachPdfOption'

interface QuoteShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quoteId: string
  organizationId: string
  initialToken: string | null
  /** Called once the quote has actually gone to the customer. */
  onSent?: () => void
  customer?: {
    id: string
    name: string
    email: string | null
    phone: string | null
  } | null
  emailEnabled?: boolean
}

export function QuoteShareDialog({
  open,
  onOpenChange,
  quoteId,
  organizationId,
  initialToken,
  onSent,
  customer,
  emailEnabled = false,
}: QuoteShareDialogProps) {
  const [publicToken, setPublicToken] = useState<string | null>(initialToken)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [notifyEmail, setNotifyEmail] = useState(false)
  const [attachPdf, setAttachPdf] = useAttachPdf(open)
  const [notifySms, setNotifySms] = useState(false)
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false)
  const [sending, setSending] = useState(false)
  const t = useTranslations('quotes')
  const tc = useTranslations('common')

  const hasEmail = !!customer?.email
  const hasPhone = !!customer?.phone
  const channels = useShareChannels(open)
  const smsReady = channels?.sms === 'ready' && hasPhone
  const whatsappSetUp = channels?.whatsapp === 'ready' && hasPhone
  const whatsappReach = useWhatsappReach(open && whatsappSetUp, customer?.id)
  const whatsappReady = whatsappSetUp && whatsappReach === true

  const publicUrl =
    publicToken && organizationId
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/quote/${organizationId}/${publicToken}`
      : null

  // An action that cannot reach the server throws instead of answering, so
  // both of these catch it and say the same thing a refusal does.
  const handleGenerate = async () => {
    setGeneratingLink(true)
    const result = await generateQuotePublicLink(quoteId).catch(() => null)
    if (result?.success && result.data) {
      setPublicToken(result.data.token)
      // Handing over a link is a way of sending the quote.
      onSent?.()
    } else {
      toast.error(tc('shareLink.generateFailed'))
    }
    setGeneratingLink(false)
  }

  // The link stays on screen until the server has revoked it: clearing it on
  // a refusal would tell the workshop it is gone while the customer's copy
  // still opens the quote.
  const handleRevoke = async () => {
    if (revoking) return
    setRevoking(true)
    const result = await revokeQuotePublicLink(quoteId).catch(() => null)
    if (result?.success) {
      setPublicToken(null)
    } else {
      toast.error(tc('shareLink.revokeFailed'))
    }
    setRevoking(false)
  }

  const handleCopy = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleNotify = async () => {
    if (!publicUrl || !customer) return
    setSending(true)

    const results: string[] = []
    let failed = false

    if (notifyEmail && hasEmail) {
      const res = await sendQuoteEmail({
        quoteId,
        recipientEmail: customer.email!,
        attachPdf,
      })
      if (res.success) {
        track('document:email_send', { document: 'quote' })
        results.push(t('shareDialog.emailSent'))
        setNotifyEmail(false)
      } else {
        failed = true
        if (!handleGated(res)) toast.error(res.error || t('shareDialog.failedEmail'))
      }
    }

    // The same words on both channels: a text and a WhatsApp message carry
    // the link, and the workshop wrote the wording once, as its SMS template.
    const wantsSms = smsReady && notifySms
    const wantsWhatsapp = whatsappReady && notifyWhatsapp
    let body = ''
    if (wantsSms || wantsWhatsapp) {
      const tplResult = await getSmsTemplates()
      const tplData = tplResult.success && tplResult.data ? tplResult.data : null
      const tpl =
        tplData?.templates[SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY] ||
        SMS_TEMPLATE_DEFAULTS[SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY]
      body = interpolateSmsTemplate(tpl || '', {
        share_link: publicUrl,
        customer_name: customer.name,
        company_name: tplData?.companyName || '',
        current_user: tplData?.currentUser || '',
      })
    }

    if (wantsSms) {
      const res = await sendSmsToCustomer({
        customerId: customer.id,
        body,
        relatedEntityType: 'quote',
        relatedEntityId: quoteId,
      })
      if (res.success) {
        results.push(t('shareDialog.smsSent'))
        setNotifySms(false)
      } else {
        failed = true
        if (!handleGated(res)) toast.error(res.error || t('shareDialog.failedSms'))
      }
    }

    if (wantsWhatsapp) {
      const res = await sendWhatsappToCustomer({
        customerId: customer.id,
        body,
        relatedEntityType: 'quote',
        relatedEntityId: quoteId,
      })
      if (res.success) {
        results.push(tc('shareLink.whatsappSent'))
        setNotifyWhatsapp(false)
      } else {
        failed = true
        if (!handleGated(res)) toast.error(res.error || tc('shareLink.failedWhatsapp'))
      }
    }

    if (results.length > 0) {
      toast.success(results.join(' & '))
      // Either channel re-issues the quote, and the lock may have engaged.
      onSent?.()
    }
    setSending(false)
    // Done once everything ticked has gone. A channel that failed stays ticked
    // and the dialog stays open, so it can be tried again.
    if (results.length > 0 && !failed) onOpenChange(false)
  }

  const canNotify =
    publicUrl &&
    customer &&
    (notifyEmail || (smsReady && notifySms) || (whatsappReady && notifyWhatsapp))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t('shareDialog.title')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('shareDialog.description')}</p>
          {publicUrl ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={publicUrl} readOnly className="text-xs font-mono" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label={t('shareDialog.copyLink')}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Notify customer */}
              {customer && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {t('shareDialog.notifyTitle', { name: customer.name })}
                  </p>
                  <div className="space-y-2">
                    {emailEnabled && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="notify-email-quote"
                          checked={notifyEmail}
                          onCheckedChange={(v) => setNotifyEmail(v === true)}
                          disabled={!hasEmail}
                        />
                        <Label
                          htmlFor="notify-email-quote"
                          className={`flex items-center gap-1.5 text-sm ${!hasEmail ? 'text-muted-foreground/50' : ''}`}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {t('shareDialog.email')}
                          {!hasEmail && <span className="text-xs">{t('shareDialog.noEmail')}</span>}
                        </Label>
                      </div>
                    )}
                    {emailEnabled && (
                      <div className="pl-6">
                        <AttachPdfOption
                          id="attach-pdf-quote"
                          checked={attachPdf}
                          onCheckedChange={setAttachPdf}
                          disabled={!notifyEmail || !hasEmail}
                        />
                      </div>
                    )}
                    <NotifyChannelOption
                      id="notify-sms-quote"
                      icon={<MessageSquare className="h-3.5 w-3.5" />}
                      label={t('shareDialog.sms')}
                      checked={notifySms}
                      onCheckedChange={setNotifySms}
                      status={channels?.sms}
                      isCloud={channels?.isCloud ?? false}
                      missingContact={hasPhone ? null : t('shareDialog.noPhone')}
                    />
                    <NotifyChannelOption
                      id="notify-whatsapp-quote"
                      icon={<MessageCircle className="h-3.5 w-3.5" />}
                      label={tc('shareLink.whatsapp')}
                      checked={notifyWhatsapp}
                      onCheckedChange={setNotifyWhatsapp}
                      status={channels?.whatsapp}
                      isCloud={channels?.isCloud ?? false}
                      missingContact={hasPhone ? null : t('shareDialog.noPhone')}
                      blockedReason={
                        whatsappReach === false ? tc('shareLink.whatsappWindowClosed') : null
                      }
                    />
                  </div>
                  {/* Always here, disabled until a channel is ticked: it used to
                      appear on the first tick and shove the dialog around. */}
                  <Button
                    size="sm"
                    onClick={handleNotify}
                    disabled={sending || !canNotify}
                    className="w-full"
                  >
                    {sending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    {t('shareDialog.sendNotification')}
                  </Button>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleRevoke}
                disabled={revoking}
              >
                {revoking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('shareDialog.revokeLink')}
              </Button>
            </>
          ) : (
            <Button onClick={handleGenerate} disabled={generatingLink}>
              {generatingLink && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('shareDialog.generateLink')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
