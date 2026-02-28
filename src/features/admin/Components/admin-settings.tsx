'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Send } from 'lucide-react'
import { SYSTEM_SETTING_KEYS } from '../Schema/systemSettingsSchema'
import type { SystemSettingsMap } from '../Schema/systemSettingsSchema'
import { setSystemSettings } from '../Actions/setSystemSettings'
import { testEmailConnection } from '../Actions/testEmailConnection'

type EmailProviderType = 'smtp' | 'resend' | 'postmark' | 'mailgun' | 'sendgrid' | 'ses'

export function AdminSettings({
  initial,
}: {
  initial: SystemSettingsMap
  mode: 'cloud' | 'self-hosted'
}) {
  const router = useRouter()
  const t = useTranslations('admin')
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)

  // Platform settings
  const [registrationDisabled, setRegistrationDisabled] = useState(
    initial[SYSTEM_SETTING_KEYS.REGISTRATION_DISABLED] === 'true'
  )
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(
    initial[SYSTEM_SETTING_KEYS.EMAIL_VERIFICATION_REQUIRED] === 'true'
  )

  // Email provider
  const [emailProvider, setEmailProvider] = useState<EmailProviderType>(
    (initial[SYSTEM_SETTING_KEYS.EMAIL_PROVIDER] as EmailProviderType) || 'smtp'
  )

  // SMTP settings
  const [smtpHost, setSmtpHost] = useState(initial[SYSTEM_SETTING_KEYS.SMTP_HOST] || '')
  const [smtpPort, setSmtpPort] = useState(initial[SYSTEM_SETTING_KEYS.SMTP_PORT] || '587')
  const [smtpUser, setSmtpUser] = useState(initial[SYSTEM_SETTING_KEYS.SMTP_USER] || '')
  const [smtpPass, setSmtpPass] = useState(initial[SYSTEM_SETTING_KEYS.SMTP_PASS] || '')
  const [smtpSecure, setSmtpSecure] = useState(initial[SYSTEM_SETTING_KEYS.SMTP_SECURE] === 'true')
  const [smtpFromEmail, setSmtpFromEmail] = useState(
    initial[SYSTEM_SETTING_KEYS.SMTP_FROM_EMAIL] || ''
  )
  const [smtpFromName, setSmtpFromName] = useState(
    initial[SYSTEM_SETTING_KEYS.SMTP_FROM_NAME] || ''
  )
  const [smtpRejectUnauthorized, setSmtpRejectUnauthorized] = useState(
    initial[SYSTEM_SETTING_KEYS.SMTP_REJECT_UNAUTHORIZED] !== 'false'
  )
  const [smtpRequireTls, setSmtpRequireTls] = useState(
    initial[SYSTEM_SETTING_KEYS.SMTP_REQUIRE_TLS] === 'true'
  )

  // Resend settings
  const [resendApiKey, setResendApiKey] = useState(
    initial[SYSTEM_SETTING_KEYS.RESEND_API_KEY] || ''
  )
  const [resendFromEmail, setResendFromEmail] = useState(
    initial[SYSTEM_SETTING_KEYS.RESEND_FROM_EMAIL] || ''
  )
  const [resendFromName, setResendFromName] = useState(
    initial[SYSTEM_SETTING_KEYS.RESEND_FROM_NAME] || ''
  )

  // Postmark settings
  const [postmarkApiKey, setPostmarkApiKey] = useState(
    initial[SYSTEM_SETTING_KEYS.POSTMARK_API_KEY] || ''
  )
  const [postmarkFromEmail, setPostmarkFromEmail] = useState(
    initial[SYSTEM_SETTING_KEYS.POSTMARK_FROM_EMAIL] || ''
  )
  const [postmarkFromName, setPostmarkFromName] = useState(
    initial[SYSTEM_SETTING_KEYS.POSTMARK_FROM_NAME] || ''
  )

  // Mailgun settings
  const [mailgunApiKey, setMailgunApiKey] = useState(
    initial[SYSTEM_SETTING_KEYS.MAILGUN_API_KEY] || ''
  )
  const [mailgunDomain, setMailgunDomain] = useState(
    initial[SYSTEM_SETTING_KEYS.MAILGUN_DOMAIN] || ''
  )
  const [mailgunRegion, setMailgunRegion] = useState(
    initial[SYSTEM_SETTING_KEYS.MAILGUN_REGION] || 'us'
  )
  const [mailgunFromEmail, setMailgunFromEmail] = useState(
    initial[SYSTEM_SETTING_KEYS.MAILGUN_FROM_EMAIL] || ''
  )
  const [mailgunFromName, setMailgunFromName] = useState(
    initial[SYSTEM_SETTING_KEYS.MAILGUN_FROM_NAME] || ''
  )

  // SendGrid settings
  const [sendgridApiKey, setSendgridApiKey] = useState(
    initial[SYSTEM_SETTING_KEYS.SENDGRID_API_KEY] || ''
  )
  const [sendgridFromEmail, setSendgridFromEmail] = useState(
    initial[SYSTEM_SETTING_KEYS.SENDGRID_FROM_EMAIL] || ''
  )
  const [sendgridFromName, setSendgridFromName] = useState(
    initial[SYSTEM_SETTING_KEYS.SENDGRID_FROM_NAME] || ''
  )

  // Amazon SES settings
  const [sesAccessKeyId, setSesAccessKeyId] = useState(
    initial[SYSTEM_SETTING_KEYS.SES_ACCESS_KEY_ID] || ''
  )
  const [sesSecretAccessKey, setSesSecretAccessKey] = useState(
    initial[SYSTEM_SETTING_KEYS.SES_SECRET_ACCESS_KEY] || ''
  )
  const [sesRegion, setSesRegion] = useState(
    initial[SYSTEM_SETTING_KEYS.SES_REGION] || 'us-east-1'
  )
  const [sesFromEmail, setSesFromEmail] = useState(
    initial[SYSTEM_SETTING_KEYS.SES_FROM_EMAIL] || ''
  )
  const [sesFromName, setSesFromName] = useState(
    initial[SYSTEM_SETTING_KEYS.SES_FROM_NAME] || ''
  )

  const handleSave = () => {
    startTransition(async () => {
      const data: Record<string, string> = {
        [SYSTEM_SETTING_KEYS.REGISTRATION_DISABLED]: String(registrationDisabled),
        [SYSTEM_SETTING_KEYS.EMAIL_VERIFICATION_REQUIRED]: String(emailVerificationRequired),
        [SYSTEM_SETTING_KEYS.EMAIL_PROVIDER]: emailProvider,
        // SMTP
        [SYSTEM_SETTING_KEYS.SMTP_HOST]: smtpHost,
        [SYSTEM_SETTING_KEYS.SMTP_PORT]: smtpPort,
        [SYSTEM_SETTING_KEYS.SMTP_USER]: smtpUser,
        [SYSTEM_SETTING_KEYS.SMTP_PASS]: smtpPass,
        [SYSTEM_SETTING_KEYS.SMTP_SECURE]: String(smtpSecure),
        [SYSTEM_SETTING_KEYS.SMTP_FROM_EMAIL]: smtpFromEmail,
        [SYSTEM_SETTING_KEYS.SMTP_FROM_NAME]: smtpFromName,
        [SYSTEM_SETTING_KEYS.SMTP_REJECT_UNAUTHORIZED]: String(smtpRejectUnauthorized),
        [SYSTEM_SETTING_KEYS.SMTP_REQUIRE_TLS]: String(smtpRequireTls),
        // Resend
        [SYSTEM_SETTING_KEYS.RESEND_API_KEY]: resendApiKey,
        [SYSTEM_SETTING_KEYS.RESEND_FROM_EMAIL]: resendFromEmail,
        [SYSTEM_SETTING_KEYS.RESEND_FROM_NAME]: resendFromName,
        // Postmark
        [SYSTEM_SETTING_KEYS.POSTMARK_API_KEY]: postmarkApiKey,
        [SYSTEM_SETTING_KEYS.POSTMARK_FROM_EMAIL]: postmarkFromEmail,
        [SYSTEM_SETTING_KEYS.POSTMARK_FROM_NAME]: postmarkFromName,
        // Mailgun
        [SYSTEM_SETTING_KEYS.MAILGUN_API_KEY]: mailgunApiKey,
        [SYSTEM_SETTING_KEYS.MAILGUN_DOMAIN]: mailgunDomain,
        [SYSTEM_SETTING_KEYS.MAILGUN_REGION]: mailgunRegion,
        [SYSTEM_SETTING_KEYS.MAILGUN_FROM_EMAIL]: mailgunFromEmail,
        [SYSTEM_SETTING_KEYS.MAILGUN_FROM_NAME]: mailgunFromName,
        // SendGrid
        [SYSTEM_SETTING_KEYS.SENDGRID_API_KEY]: sendgridApiKey,
        [SYSTEM_SETTING_KEYS.SENDGRID_FROM_EMAIL]: sendgridFromEmail,
        [SYSTEM_SETTING_KEYS.SENDGRID_FROM_NAME]: sendgridFromName,
        // Amazon SES
        [SYSTEM_SETTING_KEYS.SES_ACCESS_KEY_ID]: sesAccessKeyId,
        [SYSTEM_SETTING_KEYS.SES_SECRET_ACCESS_KEY]: sesSecretAccessKey,
        [SYSTEM_SETTING_KEYS.SES_REGION]: sesRegion,
        [SYSTEM_SETTING_KEYS.SES_FROM_EMAIL]: sesFromEmail,
        [SYSTEM_SETTING_KEYS.SES_FROM_NAME]: sesFromName,
      }

      const result = await setSystemSettings(data)
      if (result.success) {
        toast.success(t('adminSettings.saved'))
        router.refresh()
      } else {
        toast.error(result.error ?? t('adminSettings.failedSave'))
      }
    })
  }

  const handleTestEmail = async () => {
    setIsTesting(true)
    try {
      const result = await testEmailConnection()
      if (result.success) {
        toast.success(t('adminSettings.testSentTo', { email: result.data?.sentTo ?? '' }))
      } else {
        toast.error(result.error ?? t('adminSettings.testFailed'))
      }
    } finally {
      setIsTesting(false)
    }
  }

  const isTestDisabled =
    isTesting ||
    (emailProvider === 'smtp' && !smtpHost) ||
    (emailProvider === 'resend' && !resendApiKey) ||
    (emailProvider === 'postmark' && !postmarkApiKey) ||
    (emailProvider === 'mailgun' && !mailgunApiKey) ||
    (emailProvider === 'sendgrid' && !sendgridApiKey) ||
    (emailProvider === 'ses' && !sesAccessKeyId)

  return (
    <div className="space-y-6">
      {/* Platform Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminSettings.platformTitle')}</CardTitle>
          <CardDescription>{t('adminSettings.platformDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="registration-toggle">{t('adminSettings.disableRegistration')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('adminSettings.disableRegistrationHint')}
              </p>
            </div>
            <Switch
              id="registration-toggle"
              checked={registrationDisabled}
              onCheckedChange={setRegistrationDisabled}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-verification-toggle">{t('adminSettings.requireEmailVerification')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('adminSettings.requireEmailVerificationHint')}
              </p>
            </div>
            <Switch
              id="email-verification-toggle"
              checked={emailVerificationRequired}
              onCheckedChange={setEmailVerificationRequired}
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminSettings.emailTitle')}</CardTitle>
          <CardDescription>
            {t('adminSettings.emailDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={emailProvider === 'smtp' ? 'default' : 'outline'}
              onClick={() => setEmailProvider('smtp')}
              className="flex-1"
            >
              SMTP
            </Button>
            <Button
              type="button"
              variant={emailProvider === 'resend' ? 'default' : 'outline'}
              onClick={() => setEmailProvider('resend')}
              className="flex-1"
            >
              Resend
            </Button>
            <Button
              type="button"
              variant={emailProvider === 'postmark' ? 'default' : 'outline'}
              onClick={() => setEmailProvider('postmark')}
              className="flex-1"
            >
              Postmark
            </Button>
            <Button
              type="button"
              variant={emailProvider === 'mailgun' ? 'default' : 'outline'}
              onClick={() => setEmailProvider('mailgun')}
              className="flex-1"
            >
              Mailgun
            </Button>
            <Button
              type="button"
              variant={emailProvider === 'sendgrid' ? 'default' : 'outline'}
              onClick={() => setEmailProvider('sendgrid')}
              className="flex-1"
            >
              SendGrid
            </Button>
            <Button
              type="button"
              variant={emailProvider === 'ses' ? 'default' : 'outline'}
              onClick={() => setEmailProvider('ses')}
              className="flex-1"
            >
              Amazon SES
            </Button>
          </div>

          {emailProvider === 'smtp' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">{t('adminSettings.smtpHost')}</Label>
                  <Input
                    id="smtp-host"
                    placeholder="smtp.example.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">{t('adminSettings.smtpPort')}</Label>
                  <Input
                    id="smtp-port"
                    placeholder="587"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">{t('adminSettings.username')}</Label>
                  <Input
                    id="smtp-user"
                    placeholder="user@example.com"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-pass">{t('adminSettings.password')}</Label>
                  <Input
                    id="smtp-pass"
                    type="password"
                    placeholder="••••••••"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-email">{t('adminSettings.fromEmail')}</Label>
                  <Input
                    id="smtp-from-email"
                    placeholder="noreply@example.com"
                    value={smtpFromEmail}
                    onChange={(e) => setSmtpFromEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-name">{t('adminSettings.fromName')}</Label>
                  <Input
                    id="smtp-from-name"
                    placeholder="Torqvoice"
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="smtp-secure">{t('adminSettings.tlsConnection')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('adminSettings.tlsConnectionHint')}
                    </p>
                  </div>
                  <Switch id="smtp-secure" checked={smtpSecure} onCheckedChange={setSmtpSecure} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="smtp-reject-unauthorized">{t('adminSettings.verifyTls')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('adminSettings.verifyTlsHint')}
                    </p>
                  </div>
                  <Switch
                    id="smtp-reject-unauthorized"
                    checked={smtpRejectUnauthorized}
                    onCheckedChange={setSmtpRejectUnauthorized}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="smtp-require-tls">{t('adminSettings.requireTlsUpgrade')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('adminSettings.requireTlsUpgradeHint')}
                    </p>
                  </div>
                  <Switch
                    id="smtp-require-tls"
                    checked={smtpRequireTls}
                    onCheckedChange={setSmtpRequireTls}
                  />
                </div>
              </div>
            </>
          )}

          {emailProvider === 'resend' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="resend-api-key">{t('adminSettings.apiKey')}</Label>
                <Input
                  id="resend-api-key"
                  type="password"
                  placeholder="re_••••••••"
                  value={resendApiKey}
                  onChange={(e) => setResendApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('adminSettings.resendApiKeyHint')}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="resend-from-email">{t('adminSettings.fromEmail')}</Label>
                  <Input
                    id="resend-from-email"
                    placeholder="noreply@yourdomain.com"
                    value={resendFromEmail}
                    onChange={(e) => setResendFromEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resend-from-name">{t('adminSettings.fromName')}</Label>
                  <Input
                    id="resend-from-name"
                    placeholder="Torqvoice"
                    value={resendFromName}
                    onChange={(e) => setResendFromName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {emailProvider === 'postmark' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="postmark-api-key">{t('adminSettings.serverToken')}</Label>
                <Input
                  id="postmark-api-key"
                  type="password"
                  placeholder="••••••••-••••-••••-••••-••••••••••••"
                  value={postmarkApiKey}
                  onChange={(e) => setPostmarkApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('adminSettings.postmarkApiKeyHint')}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="postmark-from-email">{t('adminSettings.fromEmail')}</Label>
                  <Input
                    id="postmark-from-email"
                    placeholder="noreply@yourdomain.com"
                    value={postmarkFromEmail}
                    onChange={(e) => setPostmarkFromEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postmark-from-name">{t('adminSettings.fromName')}</Label>
                  <Input
                    id="postmark-from-name"
                    placeholder="Torqvoice"
                    value={postmarkFromName}
                    onChange={(e) => setPostmarkFromName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {emailProvider === 'mailgun' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="mailgun-api-key">{t('adminSettings.apiKey')}</Label>
                <Input
                  id="mailgun-api-key"
                  type="password"
                  placeholder="key-••••••••••••••••••••••••••••••••"
                  value={mailgunApiKey}
                  onChange={(e) => setMailgunApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('adminSettings.mailgunApiKeyHint')}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mailgun-domain">{t('adminSettings.domain')}</Label>
                  <Input
                    id="mailgun-domain"
                    placeholder="mg.yourdomain.com"
                    value={mailgunDomain}
                    onChange={(e) => setMailgunDomain(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mailgun-region">{t('adminSettings.region')}</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={mailgunRegion === 'us' ? 'default' : 'outline'}
                      onClick={() => setMailgunRegion('us')}
                      className="flex-1"
                      size="sm"
                    >
                      US
                    </Button>
                    <Button
                      type="button"
                      variant={mailgunRegion === 'eu' ? 'default' : 'outline'}
                      onClick={() => setMailgunRegion('eu')}
                      className="flex-1"
                      size="sm"
                    >
                      EU
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mailgun-from-email">{t('adminSettings.fromEmail')}</Label>
                  <Input
                    id="mailgun-from-email"
                    placeholder="noreply@yourdomain.com"
                    value={mailgunFromEmail}
                    onChange={(e) => setMailgunFromEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mailgun-from-name">{t('adminSettings.fromName')}</Label>
                  <Input
                    id="mailgun-from-name"
                    placeholder="Torqvoice"
                    value={mailgunFromName}
                    onChange={(e) => setMailgunFromName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {emailProvider === 'sendgrid' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="sendgrid-api-key">{t('adminSettings.apiKey')}</Label>
                <Input
                  id="sendgrid-api-key"
                  type="password"
                  placeholder="SG.••••••••••••••••••••••••••••••••"
                  value={sendgridApiKey}
                  onChange={(e) => setSendgridApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('adminSettings.sendgridApiKeyHint')}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sendgrid-from-email">{t('adminSettings.fromEmail')}</Label>
                  <Input
                    id="sendgrid-from-email"
                    placeholder="noreply@yourdomain.com"
                    value={sendgridFromEmail}
                    onChange={(e) => setSendgridFromEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sendgrid-from-name">{t('adminSettings.fromName')}</Label>
                  <Input
                    id="sendgrid-from-name"
                    placeholder="Torqvoice"
                    value={sendgridFromName}
                    onChange={(e) => setSendgridFromName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {emailProvider === 'ses' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ses-access-key">{t('adminSettings.accessKeyId')}</Label>
                  <Input
                    id="ses-access-key"
                    type="password"
                    placeholder="AKIA••••••••••••••••"
                    value={sesAccessKeyId}
                    onChange={(e) => setSesAccessKeyId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ses-secret-key">{t('adminSettings.secretAccessKey')}</Label>
                  <Input
                    id="ses-secret-key"
                    type="password"
                    placeholder="••••••••••••••••••••••••••••••••••••••••"
                    value={sesSecretAccessKey}
                    onChange={(e) => setSesSecretAccessKey(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ses-region">{t('adminSettings.awsRegion')}</Label>
                <Input
                  id="ses-region"
                  placeholder="us-east-1"
                  value={sesRegion}
                  onChange={(e) => setSesRegion(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('adminSettings.awsRegionHint')}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ses-from-email">{t('adminSettings.fromEmail')}</Label>
                  <Input
                    id="ses-from-email"
                    placeholder="noreply@yourdomain.com"
                    value={sesFromEmail}
                    onChange={(e) => setSesFromEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ses-from-name">{t('adminSettings.fromName')}</Label>
                  <Input
                    id="ses-from-name"
                    placeholder="Torqvoice"
                    value={sesFromName}
                    onChange={(e) => setSesFromName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestEmail}
              disabled={isTestDisabled}
            >
              {isTesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {t('adminSettings.sendTestEmail')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('adminSettings.testEmailHint')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('adminSettings.saveSettings')}
        </Button>
      </div>
    </div>
  )
}
