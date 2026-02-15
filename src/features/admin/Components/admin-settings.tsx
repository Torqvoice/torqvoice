'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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

export function AdminSettings({
  initial,
}: {
  initial: SystemSettingsMap
  mode: 'cloud' | 'self-hosted'
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)

  // Platform settings
  const [registrationDisabled, setRegistrationDisabled] = useState(
    initial[SYSTEM_SETTING_KEYS.REGISTRATION_DISABLED] === 'true'
  )

  // Email provider
  const [emailProvider, setEmailProvider] = useState<'smtp' | 'resend'>(
    (initial[SYSTEM_SETTING_KEYS.EMAIL_PROVIDER] as 'smtp' | 'resend') || 'smtp'
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

  const handleSave = () => {
    startTransition(async () => {
      const data: Record<string, string> = {
        [SYSTEM_SETTING_KEYS.REGISTRATION_DISABLED]: String(registrationDisabled),
        [SYSTEM_SETTING_KEYS.EMAIL_PROVIDER]: emailProvider,
        [SYSTEM_SETTING_KEYS.SMTP_HOST]: smtpHost,
        [SYSTEM_SETTING_KEYS.SMTP_PORT]: smtpPort,
        [SYSTEM_SETTING_KEYS.SMTP_USER]: smtpUser,
        [SYSTEM_SETTING_KEYS.SMTP_PASS]: smtpPass,
        [SYSTEM_SETTING_KEYS.SMTP_SECURE]: String(smtpSecure),
        [SYSTEM_SETTING_KEYS.SMTP_FROM_EMAIL]: smtpFromEmail,
        [SYSTEM_SETTING_KEYS.SMTP_FROM_NAME]: smtpFromName,
        [SYSTEM_SETTING_KEYS.SMTP_REJECT_UNAUTHORIZED]: String(smtpRejectUnauthorized),
        [SYSTEM_SETTING_KEYS.SMTP_REQUIRE_TLS]: String(smtpRequireTls),
        [SYSTEM_SETTING_KEYS.RESEND_API_KEY]: resendApiKey,
        [SYSTEM_SETTING_KEYS.RESEND_FROM_EMAIL]: resendFromEmail,
        [SYSTEM_SETTING_KEYS.RESEND_FROM_NAME]: resendFromName,
      }

      const result = await setSystemSettings(data)
      if (result.success) {
        toast.success('Settings saved successfully')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Failed to save settings')
      }
    })
  }

  const handleTestEmail = async () => {
    setIsTesting(true)
    try {
      const result = await testEmailConnection()
      if (result.success) {
        toast.success(`Test email sent to ${result.data?.sentTo}`)
      } else {
        toast.error(result.error ?? 'Email test failed')
      }
    } finally {
      setIsTesting(false)
    }
  }

  const isTestDisabled =
    isTesting ||
    (emailProvider === 'smtp' && !smtpHost) ||
    (emailProvider === 'resend' && !resendApiKey)

  return (
    <div className="space-y-6">
      {/* Platform Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Settings</CardTitle>
          <CardDescription>General platform configuration options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="registration-toggle">Disable Registration</Label>
              <p className="text-xs text-muted-foreground">
                Block new user sign-ups on the platform
              </p>
            </div>
            <Switch
              id="registration-toggle"
              checked={registrationDisabled}
              onCheckedChange={setRegistrationDisabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Email Provider</CardTitle>
          <CardDescription>
            Choose how the platform sends emails (password resets, invoices, notifications)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
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
          </div>
        </CardContent>
      </Card>

      {/* SMTP Settings */}
      {emailProvider === 'smtp' && (
        <Card>
          <CardHeader>
            <CardTitle>SMTP Email Settings</CardTitle>
            <CardDescription>
              Configure email delivery for the platform. These settings override environment
              variables when set.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtp-host">SMTP Host</Label>
                <Input
                  id="smtp-host"
                  placeholder="smtp.example.com"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-port">SMTP Port</Label>
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
                <Label htmlFor="smtp-user">Username</Label>
                <Input
                  id="smtp-user"
                  placeholder="user@example.com"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-pass">Password</Label>
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
                <Label htmlFor="smtp-from-email">From Email</Label>
                <Input
                  id="smtp-from-email"
                  placeholder="noreply@example.com"
                  value={smtpFromEmail}
                  onChange={(e) => setSmtpFromEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-from-name">From Name</Label>
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
                  <Label htmlFor="smtp-secure">TLS Connection (Port 465)</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable for implicit TLS. Disable for STARTTLS (port 587/25).
                  </p>
                </div>
                <Switch id="smtp-secure" checked={smtpSecure} onCheckedChange={setSmtpSecure} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="smtp-reject-unauthorized">Verify TLS Certificates</Label>
                  <p className="text-xs text-muted-foreground">
                    Disable to allow self-signed certificates (not recommended for production)
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
                  <Label htmlFor="smtp-require-tls">Require TLS Upgrade</Label>
                  <p className="text-xs text-muted-foreground">
                    Force TLS upgrade on STARTTLS connections
                  </p>
                </div>
                <Switch
                  id="smtp-require-tls"
                  checked={smtpRequireTls}
                  onCheckedChange={setSmtpRequireTls}
                />
              </div>
            </div>

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
                Send Test Email
              </Button>
              <p className="text-xs text-muted-foreground">
                Save settings first, then send a test email to your account
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resend Settings */}
      {emailProvider === 'resend' && (
        <Card>
          <CardHeader>
            <CardTitle>Resend Email Settings</CardTitle>
            <CardDescription>
              Configure email delivery using Resend. Get your API key from{' '}
              <a
                href="https://resend.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                resend.com
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="resend-api-key">API Key</Label>
              <Input
                id="resend-api-key"
                type="password"
                placeholder="re_••••••••"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="resend-from-email">From Email</Label>
                <Input
                  id="resend-from-email"
                  placeholder="noreply@yourdomain.com"
                  value={resendFromEmail}
                  onChange={(e) => setResendFromEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resend-from-name">From Name</Label>
                <Input
                  id="resend-from-name"
                  placeholder="Torqvoice"
                  value={resendFromName}
                  onChange={(e) => setResendFromName(e.target.value)}
                />
              </div>
            </div>

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
                Send Test Email
              </Button>
              <p className="text-xs text-muted-foreground">
                Save settings first, then send a test email to your account
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Settings
        </Button>
      </div>
    </div>
  )
}
