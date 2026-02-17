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
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Save, Shield, ShieldOff, Trash2, User } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { updateEmail } from '@/features/settings/Actions/accountActions'
import { deleteAccount } from '@/features/settings/Actions/deleteAccount'
import { deleteContent } from '@/features/settings/Actions/deleteContent'
import { signOut } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'

interface ContentCounts {
  vehicles: number
  customers: number
  quotes: number
  inventory: number
}

export function AccountSettings({
  twoFactorEnabled: initialTwoFactorEnabled,
  contentCounts,
}: {
  twoFactorEnabled: boolean
  contentCounts: ContentCounts
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name)
    if (session?.user?.email) setEmail(session.user.email)
  }, [session?.user?.name, session?.user?.email])

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
        toast.error(result.error || 'Failed to delete account')
        setDeleting(false)
      }
    } catch {
      toast.error('Failed to delete account')
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
        toast.success('Selected content has been permanently deleted')
        setContentDialogOpen(false)
        setContentConfirmText('')
        setContentSelections({ vehicles: false, customers: false, quotes: false, inventory: false })
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to delete content')
      }
    } catch {
      toast.error('Failed to delete content')
    }
    setDeletingContent(false)
  }

  const handleEnable2FA = async () => {
    if (!twoFactorPassword) {
      toast.error('Please enter your password')
      return
    }
    setEnabling2FA(true)
    try {
      const result = await authClient.twoFactor.enable({ password: twoFactorPassword })
      if (result.error) {
        toast.error(result.error.message || 'Failed to enable 2FA')
      } else {
        setTotpURI(result.data?.totpURI || '')
        setBackupCodes(result.data?.backupCodes || [])
        setSetupStep('qr')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enable 2FA')
    }
    setEnabling2FA(false)
  }

  const handleDisable2FA = async () => {
    if (!twoFactorPassword) {
      toast.error('Please enter your password')
      return
    }
    setDisabling2FA(true)
    try {
      const result = await authClient.twoFactor.disable({ password: twoFactorPassword })
      if (result.error) {
        toast.error(result.error.message || 'Failed to disable 2FA')
      } else {
        setTwoFactorEnabled(false)
        setTwoFactorPassword('')
        toast.success('Two-factor authentication disabled')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disable 2FA')
    }
    setDisabling2FA(false)
  }

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'))
    setCopiedBackup(true)
    toast.success('Backup codes copied to clipboard')
    setTimeout(() => setCopiedBackup(false), 2000)
  }

  const handleVerify2FA = async () => {
    if (!verifyCode.trim()) {
      toast.error('Please enter the code from your authenticator app')
      return
    }
    setVerifying2FA(true)
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: verifyCode })
      if (result.error) {
        toast.error(result.error.message || 'Invalid code. Please try again.')
      } else {
        setSetupStep('backup')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed')
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
    toast.success('Two-factor authentication enabled')
  }

  const handleUpdateProfile = async () => {
    setSavingProfile(true)
    try {
      const result = await authClient.updateUser({ name })
      if (result.error) {
        toast.error(result.error.message || 'Failed to update profile')
        return
      }
      if (email !== session?.user?.email) {
        const emailResult = await updateEmail({ email })
        if (!emailResult.success) {
          toast.error(emailResult.error || 'Failed to update email')
          return
        }
      }
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile')
    }
    setSavingProfile(false)
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSavingPassword(true)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      })
      if (result.error) {
        toast.error(result.error.message || 'Failed to change password')
      } else {
        toast.success('Password changed')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password')
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
          <CardTitle className="text-lg">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Update your display name and email address.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display-name">Name</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => {
                  // Ignore browser autofill that overwrites name with email
                  if (e.target.value === session?.user?.email) return
                  setName(e.target.value)
                }}
                placeholder="Your name"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                autoComplete="off"
              />
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
              Save Profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter your current password and choose a new one.
          </p>
          <div className="grid gap-4 sm:grid-cols-1 max-w-sm">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
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
              Change Password
            </Button>
          </div>
        </CardContent>
      </Card>
      {/* Two-Factor Authentication */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Two-Factor Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {twoFactorEnabled ? (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3">
                <Shield className="h-5 w-5 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Two-factor authentication is enabled
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter your password to disable two-factor authentication.
              </p>
              <div className="max-w-sm space-y-2">
                <Label htmlFor="2fa-disable-password">Password</Label>
                <Input
                  id="2fa-disable-password"
                  type="password"
                  value={twoFactorPassword}
                  onChange={(e) => setTwoFactorPassword(e.target.value)}
                  placeholder="Enter your password"
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
                Disable 2FA
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security to your account by enabling two-factor authentication
                with an authenticator app.
              </p>
              <Separator />
              <Button onClick={handleOpenSetupDialog}>
                <Shield className="mr-2 h-4 w-4" />
                Enable 2FA
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
                <DialogTitle>Enable Two-Factor Authentication</DialogTitle>
                <DialogDescription>
                  Enter your password to begin setting up 2FA with an authenticator app.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="2fa-enable-password">Password</Label>
                <Input
                  id="2fa-enable-password"
                  type="password"
                  value={twoFactorPassword}
                  onChange={(e) => setTwoFactorPassword(e.target.value)}
                  placeholder="Enter your password"
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
                  Continue
                </Button>
              </DialogFooter>
            </>
          )}

          {setupStep === 'qr' && (
            <>
              <DialogHeader>
                <DialogTitle>Scan QR Code</DialogTitle>
                <DialogDescription>
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center rounded-lg bg-white p-6">
                <QRCodeSVG value={totpURI} size={200} />
              </div>
              <DialogFooter>
                <Button onClick={() => setSetupStep('verify')} className="w-full">
                  Continue
                </Button>
              </DialogFooter>
            </>
          )}

          {setupStep === 'verify' && (
            <>
              <DialogHeader>
                <DialogTitle>Verify Code</DialogTitle>
                <DialogDescription>
                  Enter the 6-digit code from your authenticator app to verify it&apos;s set up correctly.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="2fa-verify-code">Authentication Code</Label>
                <Input
                  id="2fa-verify-code"
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
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
                  Back
                </Button>
                <Button onClick={handleVerify2FA} disabled={verifying2FA}>
                  {verifying2FA && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify
                </Button>
              </DialogFooter>
            </>
          )}

          {setupStep === 'backup' && (
            <>
              <DialogHeader>
                <DialogTitle>Save Backup Codes</DialogTitle>
                <DialogDescription className="text-amber-700 dark:text-amber-400">
                  Save these codes in a safe place. You can use them to sign in if you lose access to
                  your authenticator app. Each code can only be used once.
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
                  {copiedBackup ? 'Copied' : 'Copy Codes'}
                </Button>
                <Button onClick={handleFinishSetup} className="w-full">
                  I&apos;ve saved my backup codes
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Danger Zone */}
      <Card className="border-destructive/30 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Delete Content */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Delete Content</p>
              <p className="text-sm text-muted-foreground">
                Selectively delete organization data such as vehicles, customers, quotes, or inventory.
                Your account and settings will remain intact.
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
              Delete Content
            </Button>
          </div>

          <Separator />

          {/* Delete Account */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all associated data including vehicles, service records,
                work orders, invoices, customers, files, and payments. This action cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => { setDeleteConfirmText(''); setDeleteDialogOpen(true) }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Account</DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all data associated with it. This action is
              irreversible. All your vehicles, service records, work orders, quotes, customers, files,
              and payment history will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">
                Type <span className="font-mono font-bold">delete me</span> to confirm
              </p>
            </div>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete me"
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
              {deleting ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Content Confirmation Dialog */}
      <Dialog open={contentDialogOpen} onOpenChange={setContentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Content</DialogTitle>
            <DialogDescription>
              Select the content you want to permanently delete. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-3">
              {([
                {
                  key: 'vehicles' as const,
                  label: 'Vehicles',
                  count: contentCounts.vehicles,
                  description: 'All vehicles and their service records, notes, reminders, fuel logs, and recurring invoices',
                },
                {
                  key: 'customers' as const,
                  label: 'Customers',
                  count: contentCounts.customers,
                  description: 'All customer records. Vehicles linked to deleted customers will be unlinked.',
                },
                {
                  key: 'quotes' as const,
                  label: 'Quotes',
                  count: contentCounts.quotes,
                  description: 'All quotes and their line items',
                },
                {
                  key: 'inventory' as const,
                  label: 'Inventory',
                  count: contentCounts.inventory,
                  description: 'All inventory parts and their images',
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
                    Type <span className="font-mono font-bold">delete my data</span> to confirm
                  </p>
                </div>
                <Input
                  value={contentConfirmText}
                  onChange={(e) => setContentConfirmText(e.target.value)}
                  placeholder="delete my data"
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
              {deletingContent ? 'Deleting...' : `Delete ${selectedContentCount} selected`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
