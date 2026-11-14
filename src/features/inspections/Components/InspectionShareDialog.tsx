'use client'

import { track } from '@/lib/analytics'
import { handleGated } from '@/components/upgrade-gate'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Unlink,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  generateInspectionPublicLink,
  revokeInspectionPublicLink,
} from '../Actions/inspectionShareActions'
import { sendSmsToCustomer, getSmsTemplates } from '@/features/sms/Actions/smsActions'
import { sendInspectionEmail } from '@/features/email/Actions/emailActions'
import { NotifyChannelOption } from '@/features/messaging/Components/NotifyChannelOption'
import { useShareChannels, useWhatsappReach } from '@/features/messaging/Lib/useShareChannels'
import { sendWhatsappToCustomer } from '@/features/whatsapp/Actions/whatsappActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from '@/lib/sms-templates'
import { AttachPdfOption, useAttachPdf } from '@/features/email/Components/AttachPdfOption'

interface InspectionShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inspectionId: string
  organizationId: string
  publicToken: string | null
  customer?: {
    id: string
    name: string
    email: string | null
    phone: string | null
  } | null
  emailEnabled?: boolean
}

export function InspectionShareDialog({
  open,
  onOpenChange,
  inspectionId,
  organizationId,
  publicToken,
  customer,
  emailEnabled = false,
}: InspectionShareDialogProps) {
  const t = useTranslations('inspections.shareDialog')
  const tc = useTranslations('common')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [token, setToken] = useState(publicToken)
  const [notifySms, setNotifySms] = useState(false)
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false)
  const [notifyEmail, setNotifyEmail] = useState(false)
  const [attachPdf, setAttachPdf] = useAttachPdf(open)
  const [sending, setSending] = useState(false)

  const hasPhone = !!customer?.phone
  const channels = useShareChannels(open)
  const smsReady = channels?.sms === 'ready' && hasPhone
  const whatsappSetUp = channels?.whatsapp === 'ready' && hasPhone
  const whatsappReach = useWhatsappReach(open && whatsappSetUp, customer?.id)
  const whatsappReady = whatsappSetUp && whatsappReach === true
  const hasEmail = !!customer?.email

  const shareUrl = token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/inspection/${organizationId}/${token}`
    : null

  // An action that cannot reach the server throws instead of answering.
  // Inside a transition that would replace the page with the error page, so
  // each call is caught and reported the way a refusal is.
  const handleGenerate = () => {
    startTransition(async () => {
      const result = await generateInspectionPublicLink(inspectionId).catch(() => null)
      if (result?.success && result.data) {
        setToken(result.data.token)
        toast.success(t('generated'))
        router.refresh()
      } else {
        toast.error(tc('shareLink.generateFailed'))
      }
    })
  }

  const handleRevoke = () => {
    startTransition(async () => {
      const result = await revokeInspectionPublicLink(inspectionId).catch(() => null)
      if (result?.success) {
        setToken(null)
        toast.success(t('revoked'))
        router.refresh()
      } else {
        toast.error(tc('shareLink.revokeFailed'))
      }
    })
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    toast.success(t('copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const handleNotify = async () => {
    if (!shareUrl || !customer) return
    setSending(true)

    const results: string[] = []
    let failed = false

    if (notifyEmail && hasEmail) {
      const res = await sendInspectionEmail({
        inspectionId,
        recipientEmail: customer.email!,
        attachPdf,
      }).catch(() => null)
      if (res?.success) {
        track('document:email_send', { document: 'inspection' })
        results.push(t('emailSent'))
        setNotifyEmail(false)
      } else {
        failed = true
        if (!res || !handleGated(res)) toast.error(res?.error || t('failedEmail'))
      }
    }

    // The same words on both channels: a text and a WhatsApp message carry
    // the link, and the workshop wrote the wording once, as its SMS template.
    const wantsSms = smsReady && notifySms
    const wantsWhatsapp = whatsappReady && notifyWhatsapp
    let body = ''
    if (wantsSms || wantsWhatsapp) {
      const tplResult = await getSmsTemplates().catch(() => null)
      const tplData = tplResult?.success && tplResult.data ? tplResult.data : null
      const tpl =
        tplData?.templates[SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY] ||
        SMS_TEMPLATE_DEFAULTS[SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY]
      body = interpolateSmsTemplate(tpl || '', {
        share_link: shareUrl,
        customer_name: customer.name,
        company_name: tplData?.companyName || '',
        current_user: tplData?.currentUser || '',
      })
    }

    if (wantsSms) {
      const res = await sendSmsToCustomer({
        customerId: customer.id,
        body,
        relatedEntityType: 'inspection',
        relatedEntityId: inspectionId,
      }).catch(() => null)
      if (res?.success) {
        results.push(t('smsSent'))
        setNotifySms(false)
      } else {
        failed = true
        if (!res || !handleGated(res)) toast.error(res?.error || t('failedSms'))
      }
    }

    if (wantsWhatsapp) {
      const res = await sendWhatsappToCustomer({
        customerId: customer.id,
        body,
        relatedEntityType: 'inspection',
        relatedEntityId: inspectionId,
      }).catch(() => null)
      if (res?.success) {
        results.push(tc('shareLink.whatsappSent'))
        setNotifyWhatsapp(false)
      } else {
        failed = true
        if (!res || !handleGated(res)) toast.error(res?.error || tc('shareLink.failedWhatsapp'))
      }
    }

    if (results.length > 0) toast.success(results.join(' & '))
    setSending(false)
    // Done once everything ticked has gone. A channel that failed stays ticked
    // and the dialog stays open, so it can be tried again.
    if (results.length > 0 && !failed) onOpenChange(false)
  }

  const canNotify =
    shareUrl &&
    customer &&
    (notifyEmail || (smsReady && notifySms) || (whatsappReady && notifyWhatsapp))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {shareUrl ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={shareUrl} readOnly className="font-mono text-xs" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopy}
                  aria-label={t('copyLink')}
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
                  <p className="text-sm font-medium">{t('notifyTitle', { name: customer.name })}</p>
                  <div className="space-y-2">
                    {emailEnabled && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="notify-email-inspection"
                          checked={notifyEmail}
                          onCheckedChange={(v) => setNotifyEmail(v === true)}
                          disabled={!hasEmail}
                        />
                        <Label
                          htmlFor="notify-email-inspection"
                          className={`flex items-center gap-1.5 text-sm ${!hasEmail ? 'text-muted-foreground/50' : ''}`}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {t('email')}
                          {!hasEmail && <span className="text-xs">{t('noEmail')}</span>}
                        </Label>
                      </div>
                    )}
                    {emailEnabled && (
                      <div className="pl-6">
                        <AttachPdfOption
                          id="attach-pdf-inspection"
                          checked={attachPdf}
                          onCheckedChange={setAttachPdf}
                          disabled={!notifyEmail || !hasEmail}
                        />
                      </div>
                    )}
                    <NotifyChannelOption
                      id="notify-sms-inspection"
                      icon={<MessageSquare className="h-3.5 w-3.5" />}
                      label={t('sms')}
                      checked={notifySms}
                      onCheckedChange={setNotifySms}
                      status={channels?.sms}
                      isCloud={channels?.isCloud ?? false}
                      missingContact={hasPhone ? null : t('noPhone')}
                    />
                    <NotifyChannelOption
                      id="notify-whatsapp-inspection"
                      icon={<MessageCircle className="h-3.5 w-3.5" />}
                      label={tc('shareLink.whatsapp')}
                      checked={notifyWhatsapp}
                      onCheckedChange={setNotifyWhatsapp}
                      status={channels?.whatsapp}
                      isCloud={channels?.isCloud ?? false}
                      missingContact={hasPhone ? null : t('noPhone')}
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
                    {t('sendNotification')}
                  </Button>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={handleRevoke}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="mr-2 h-4 w-4" />
                )}
                {t('revokeLink')}
              </Button>
            </>
          ) : (
            <Button className="w-full" onClick={handleGenerate} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              {t('generateLink')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
