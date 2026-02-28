'use client'

import { useState, useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { authClient } from '@/lib/auth-client'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertTriangle, BadgeCheck, Check, Copy, KeyRound, Loader2, Mail, Save, Shield, ShieldOff, Trash2, User } from 'lucide-react'
import { PasskeySettings } from '@/features/settings/Components/passkey-settings'
import { QRCodeSVG } from 'qrcode.react'
import { updateEmail, requestEmailChange } from '@/features/settings/Actions/accountActions'
import { useCooldown } from '@/hooks/use-cooldown'
import { deleteAccount } from '@/features/settings/Actions/deleteAccount'
import { deleteContent } from '@/features/settings/Actions/deleteContent'
import { signOut } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface ContentCounts {
  vehicles: number
  customers: number
  quotes: number
  inventory: number
}

export function AccountSettings({
  twoFactorEnabled: initialTwoFactorEnabled,
  emailVerified: initialEmailVerified,
  emailVerificationRequired,
  contentCounts,
}: {
  twoFactorEnabled: boolean
  emailVerified: boolean
  emailVerificationRequired: boolean
  contentCounts: ContentCounts
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const t = useTranslations('settings')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name)
    if (session?.user?.email) setEmail(session.user.email)
  }, [session?.user?.name, session?.user?.email])

  const [emailVerified, setEmailVerified] = useState(initialEmailVerified)
  const [sendingVerification, setSendingVerification] = useState(false)
  const [verificationCooldown, startVerificationCooldown] = useCooldown('account-verify-email', 60)
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // 2FA state
  const [twoFactorPassword, setTwoFactorPassword] = useState('')
  const [totpURI, setTotpURI] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [enabling2FA, setEnabling2FA] = useState(false)
  const [disabling2FA, setDisabling2FA] = useState(false)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(initialTwoFactorEnabled)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [setupStep, setSetupStep] = useState<'password' | 'qr' | 'verify' | 'backup'>('password')
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying2FA, setVerifying2FA] = useState(false)
  const [copiedBackup, setCopiedBackup] = useState(false)

  // Delete account state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Delete content state
  const [contentDialogOpen, setContentDialogOpen] = useState(false)
  const [contentConfirmText, setContentConfirmText] = useState('')
  const [deletingContent, setDeletingContent] = useState(false)
  const [contentSelections, setContentSelections] = useState({
    vehicles: false,
    customers: false,
    quotes: false,
    inventory: false,
  })

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'delete me') return
    setDeleting(true)
    try {
      const result = await deleteAccount()
      if (result.success) {
        await signOut()
        router.push('/auth/sign-in')
      } else {
        toast.error(result.error || t('account.failedDeleteAccount'))
        setDeleting(false)
      }
    } catch {
      toast.error(t('account.failedDeleteAccount'))
      setDeleting(false)
    }
  }

  const selectedContentCount = Object.values(contentSelections).filter(Boolean).length

  const handleDeleteContent = async () => {
    if (contentConfirmText !== 'delete my data') return
    if (selectedContentCount === 0) return
    setDeletingContent(true)
    try {
      const result = await deleteContent(contentSelections)
      if (result.success) {
        toast.success(t('account.contentDeleted'))
        setContentDialogOpen(false)
        setContentConfirmText('')
        setContentSelections({ vehicles: false, customers: false, quotes: false, inventory: false })
        router.refresh()
      } else {
        toast.error(result.error || t('account.failedDeleteContent'))
      }
    } catch {
      toast.error(t('account.failedDeleteContent'))
    }
    setDeletingContent(false)
  }

  const handleEnable2FA = async () => {
    if (!twoFactorPassword) {
      toast.error(t('account.enterPasswordError'))
      return
    }
    setEnabling2FA(true)
    try {
      const result = await authClient.twoFactor.enable({ password: twoFactorPassword })
      if (result.error) {
        toast.error(result.error.message || t('account.failedEnable2FA'))
      } else {
        setTotpURI(result.data?.totpURI || '')
        setBackupCodes(result.data?.backupCodes || [])
        setSetupStep('qr')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('account.failedEnable2FA'))
    }
    setEnabling2FA(false)
  }

  const handleDisable2FA = async () => {
    if (!twoFactorPassword) {
      toast.error(t('account.enterPasswordError'))
      return
    }
    setDisabling2FA(true)
    try {
      const result = await authClient.twoFactor.disable({ password: twoFactorPassword })
      if (result.error) {
        toast.error(result.error.message || t('account.failedDisable2FA'))
      } else {
        setTwoFactorEnabled(false)
        setTwoFactorPassword('')
        toast.success(t('account.twoFactorDisabled'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('account.failedDisable2FA'))
    }
    setDisabling2FA(false)
  }

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'))
    setCopiedBackup(true)
    toast.success(t('account.backupCodesCopied'))
    setTimeout(() => setCopiedBackup(false), 2000)
  }

  const handleVerify2FA = async () => {
    if (!verifyCode.trim()) {
      toast.error(t('account.enterCodeError'))
      return
    }
    setVerifying2FA(true)
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: verifyCode })
      if (result.error) {
        toast.error(result.error.message || t('account.invalidCode'))
      } else {
        setSetupStep('backup')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('account.verificationFailed'))
    }
    setVerifying2FA(false)
  }

  const handleOpenSetupDialog = () => {
    setTwoFactorPassword('')
    setVerifyCode('')
    setSetupStep('password')
    setCopiedBackup(false)
    setDialogOpen(true)
  }

  const handleFinishSetup = () => {
    setTwoFactorEnabled(true)
    setDialogOpen(false)
    setSetupStep('password')
    setTotpURI('')
    setBackupCodes([])
    setTwoFactorPassword('')
    setVerifyCode('')
    toast.success(t('account.twoFactorEnabledSuccess'))
  }

  const handleSendVerificationEmail = async () => {
    if (verificationCooldown > 0) return
    setSendingVerification(true)
    try {
      await authClient.sendVerificationEmail({
        email: session?.user?.email ?? '',
        callbackURL: '/settings/account',
      })
      toast.success(t('account.verificationEmailSent'))
      startVerificationCooldown()
    } catch {
      toast.error(t('account.verificationEmailFailed'))
    }
    setSendingVerification(false)
  }

  const handleUpdateProfile = async () => {
    setSavingProfile(true)
    try {
      const result = await authClient.updateUser({ name })
      if (result.error) {
        toast.error(result.error.message || t('account.failedUpdateProfile'))
        return
      }
      if (email !== session?.user?.email) {
        if (emailVerificationRequired) {
          const emailResult = await requestEmailChange({ email })
          if (!emailResult.success) {
            toast.error(emailResult.error || t('account.failedUpdateEmail'))
            return
          }
          toast.success(t('account.emailChangeSent'))
        } else {
          const emailResult = await updateEmail({ email })
          if (!emailResult.success) {
            toast.error(emailResult.error || t('account.failedUpdateEmail'))
            return
          }
          toast.success(t('account.profileUpdated'))
        }
      } else {
        toast.success(t('account.profileUpdated'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('account.failedUpdateProfile'))
    }
    setSavingProfile(false)
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(t('account.passwordsNoMatch'))
      return
    }
    if (newPassword.length < 8) {
      toast.error(t('account.passwordMinLength'))
      return
    }
    setSavingPassword(true)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      })
      if (result.error) {
        toast.error(result.error.message || t('account.failedChangePassword'))
      } else {
        toast.success(t('account.passwordChanged'))
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('account.failedChangePassword'))
    }
    setSavingPassword(false)
  }

  // const initials = session?.user?.name
  //   ? session.user.name
  //       .split(' ')
  //       .map((n) => n[0])
  //       .join('')
  //       .toUpperCase()
  //       .slice(0, 2)
  //   : '?'

  return (
    <div className="space-y-6">
      {/* Profile Overview */}
      {/* <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-xl font-bold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold">{session?.user?.name}</p>
              <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card> */}

      {/* Update Name */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <User className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('account.profileTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('account.profileDescription')}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display-name">{t('account.name')}</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => {
                  // Ignore browser autofill that overwrites name with email
                  if (e.target.value === session?.user?.email) return
                  setName(e.target.value)
                }}
                placeholder={t('account.namePlaceholder')}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">{t('account.emailLabel')}</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('account.emailPlaceholder')}
                autoComplete="off"
              />
              {emailVerificationRequired && (
                <div className="flex items-center gap-2">
                  {emailVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <BadgeCheck className="h-3 w-3" />
                      {t('account.emailVerified')}
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                        {t('account.emailNotVerified')}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={handleSendVerificationEmail}
                        disabled={sendingVerification || verificationCooldown > 0}
                      >
                        {sendingVerification ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Mail className="mr-1 h-3 w-3" />
                        )}
                        {verificationCooldown > 0
                          ? t('account.resendCooldown', { seconds: verificationCooldown })
                          : t('account.sendVerificationEmail')}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Button onClick={handleUpdateProfile} disabled={savingProfile}>
              {savingProfile ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('account.saveProfile')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('account.changePasswordTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('account.changePasswordDescription')}
          </p>
          <div className="grid gap-4 sm:grid-cols-1 max-w-sm">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t('account.currentPassword')}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('account.newPassword')}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('account.confirmNewPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Button onClick={handleChangePassword} disabled={savingPassword}>
              {savingPassword ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              {t('account.changePassword')}
            </Button>
          </div>
        </CardContent>
      </Card>
      {/* Two-Factor Authentication */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('account.twoFactorTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {twoFactorEnabled ? (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3">
                <Shield className="h-5 w-5 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {t('account.twoFactorEnabled')}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('account.twoFactorDisablePrompt')}
              </p>
              <div className="max-w-sm space-y-2">
                <Label htmlFor="2fa-disable-password">{t('account.password')}</Label>
                <Input
                  id="2fa-disable-password"
                  type="password"
                  value={twoFactorPassword}
                  onChange={(e) => setTwoFactorPassword(e.target.value)}
                  placeholder={t('account.enterPassword')}
                />
              </div>
              <Separator />
              <Button
                variant="destructive"
                onClick={handleDisable2FA}
                disabled={disabling2FA}
              >
                {disabling2FA ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldOff className="mr-2 h-4 w-4" />
                )}
                {t('account.disable2FA')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t('account.twoFactorEnablePrompt')}
              </p>
              <Separator />
              <Button onClick={handleOpenSetupDialog}>
                <Shield className="mr-2 h-4 w-4" />
                {t('account.enable2FA')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* 2FA Setup Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open && setupStep !== 'backup' && setupStep !== 'verify') {
          setDialogOpen(false)
          setSetupStep('password')
          setTwoFactorPassword('')
          setVerifyCode('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          {setupStep === 'password' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('account.setupDialogTitle')}</DialogTitle>
                <DialogDescription>
                  {t('account.setupDialogDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="2fa-enable-password">{t('account.password')}</Label>
                <Input
                  id="2fa-enable-password"
                  type="password"
                  value={twoFactorPassword}
                  onChange={(e) => setTwoFactorPassword(e.target.value)}
                  placeholder={t('account.enterPassword')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEnable2FA()
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleEnable2FA} disabled={enabling2FA}>
                  {enabling2FA && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('account.continue')}
                </Button>
              </DialogFooter>
            </>
          )}

          {setupStep === 'qr' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('account.scanQRTitle')}</DialogTitle>
                <DialogDescription>
                  {t('account.scanQRDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center rounded-lg bg-white p-6">
                <QRCodeSVG value={totpURI} size={200} />
              </div>
              <DialogFooter>
                <Button onClick={() => setSetupStep('verify')} className="w-full">
                  {t('account.continue')}
                </Button>
              </DialogFooter>
            </>
          )}

          {setupStep === 'verify' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('account.verifyCodeTitle')}</DialogTitle>
                <DialogDescription>
                  {t('account.verifyCodeDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="2fa-verify-code">{t('account.authCode')}</Label>
                <Input
                  id="2fa-verify-code"
                  type="text"
                  inputMode="numeric"
                  placeholder={t('account.authCodePlaceholder')}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  autoFocus
                  autoComplete="one-time-code"
                  className="text-center text-lg tracking-widest"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleVerify2FA()
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSetupStep('qr')}>
                  {t('account.back')}
                </Button>
                <Button onClick={handleVerify2FA} disabled={verifying2FA}>
                  {verifying2FA && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('account.verify')}
                </Button>
              </DialogFooter>
            </>
          )}

          {setupStep === 'backup' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('account.backupCodesTitle')}</DialogTitle>
                <DialogDescription className="text-amber-700 dark:text-amber-400">
                  {t('account.backupCodesDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {backupCodes.map((code, i) => (
                    <div key={i} className="rounded bg-background px-3 py-1.5 text-center">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button variant="outline" onClick={handleCopyBackupCodes} className="w-full">
                  {copiedBackup ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {copiedBackup ? t('account.copied') : t('account.copyCodes')}
                </Button>
                <Button onClick={handleFinishSetup} className="w-full">
                  {t('account.savedBackupCodes')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Passkeys */}
      <PasskeySettings />

      {/* Danger Zone */}
      <Card className="border-destructive/30 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-lg text-destructive">{t('account.dangerZone')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Delete Content */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{t('account.deleteContentTitle')}</p>
              <p className="text-sm text-muted-foreground">
                {t('account.deleteContentDescription')}
              </p>
            </div>
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setContentConfirmText('')
                setContentSelections({ vehicles: false, customers: false, quotes: false, inventory: false })
                setContentDialogOpen(true)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('account.deleteContentButton')}
            </Button>
          </div>

          <Separator />

          {/* Delete Account */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{t('account.deleteAccountTitle')}</p>
              <p className="text-sm text-muted-foreground">
                {t('account.deleteAccountDescription')}
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => { setDeleteConfirmText(''); setDeleteDialogOpen(true) }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('account.deleteAccountButton')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('account.deleteAccountDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('account.deleteAccountDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">
                {t.rich('account.deleteAccountConfirmPrompt', { bold: (chunks) => <span className="font-mono font-bold">{chunks}</span> })}
              </p>
            </div>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={t('account.deleteAccountConfirmPhrase')}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'delete me' || deleting}
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {deleting ? t('account.deleting') : t('account.permanentlyDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Content Confirmation Dialog */}
      <Dialog open={contentDialogOpen} onOpenChange={setContentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('account.deleteContentDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('account.deleteContentDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-3">
              {([
                {
                  key: 'vehicles' as const,
                  label: t('account.contentVehicles'),
                  count: contentCounts.vehicles,
                  description: t('account.contentVehiclesDescription'),
                },
                {
                  key: 'customers' as const,
                  label: t('account.contentCustomers'),
                  count: contentCounts.customers,
                  description: t('account.contentCustomersDescription'),
                },
                {
                  key: 'quotes' as const,
                  label: t('account.contentQuotes'),
                  count: contentCounts.quotes,
                  description: t('account.contentQuotesDescription'),
                },
                {
                  key: 'inventory' as const,
                  label: t('account.contentInventory'),
                  count: contentCounts.inventory,
                  description: t('account.contentInventoryDescription'),
                },
              ]).map((item) => (
                <label
                  key={item.key}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    contentSelections[item.key]
                      ? 'border-destructive/50 bg-destructive/5'
                      : 'hover:bg-muted/50'
                  } ${item.count === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Checkbox
                    checked={contentSelections[item.key]}
                    disabled={item.count === 0}
                    onCheckedChange={(checked) =>
                      setContentSelections((prev) => ({ ...prev, [item.key]: checked === true }))
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {item.count}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {selectedContentCount > 0 && (
              <>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-destructive">
                    {t.rich('account.deleteContentConfirmPrompt', { bold: (chunks) => <span className="font-mono font-bold">{chunks}</span> })}
                  </p>
                </div>
                <Input
                  value={contentConfirmText}
                  onChange={(e) => setContentConfirmText(e.target.value)}
                  placeholder={t('account.deleteContentConfirmPhrase')}
                  autoComplete="off"
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContentDialogOpen(false)} disabled={deletingContent}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteContent}
              disabled={
                selectedContentCount === 0 ||
                contentConfirmText !== 'delete my data' ||
                deletingContent
              }
            >
              {deletingContent ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {deletingContent ? t('account.deleting') : t('account.deleteSelected', { count: selectedContentCount })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
