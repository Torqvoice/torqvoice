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
import { testSmtpConnection } from '../Actions/testSmtpConnection'

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

  const handleSave = () => {
    startTransition(async () => {
      const data: Record<string, string> = {
        [SYSTEM_SETTING_KEYS.REGISTRATION_DISABLED]: String(registrationDisabled),
        [SYSTEM_SETTING_KEYS.SMTP_HOST]: smtpHost,
        [SYSTEM_SETTING_KEYS.SMTP_PORT]: smtpPort,
        [SYSTEM_SETTING_KEYS.SMTP_USER]: smtpUser,
        [SYSTEM_SETTING_KEYS.SMTP_PASS]: smtpPass,
        [SYSTEM_SETTING_KEYS.SMTP_SECURE]: String(smtpSecure),
        [SYSTEM_SETTING_KEYS.SMTP_FROM_EMAIL]: smtpFromEmail,
        [SYSTEM_SETTING_KEYS.SMTP_FROM_NAME]: smtpFromName,
        [SYSTEM_SETTING_KEYS.SMTP_REJECT_UNAUTHORIZED]: String(smtpRejectUnauthorized),
        [SYSTEM_SETTING_KEYS.SMTP_REQUIRE_TLS]: String(smtpRequireTls),
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

  const handleTestSmtp = async () => {
    setIsTesting(true)
    try {
      const result = await testSmtpConnection()
      if (result.success) {
        toast.success(`Test email sent to ${result.data?.sentTo}`)
      } else {
        toast.error(result.error ?? 'SMTP test failed')
      }
    } finally {
      setIsTesting(false)
    }
  }

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

      {/* SMTP Settings */}
      <Card>
        <CardHeader>
          <CardTitle>SMTP Email Settings</CardTitle>
          <CardDescription>
            Configure email delivery for the platform. These settings override environment variables
            when set.
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
              onClick={handleTestSmtp}
              disabled={isTesting || !smtpHost}
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
