'use client'

import { AppCard } from '@/components/app-card'
import { useState, useEffect } from 'react'
import { authClient } from '@/lib/auth-client'
import { toast } from 'sonner'
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
import { Fingerprint, Loader2, LogIn, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { showNotice } from '@/components/notice-toast'
import { isPasskeyPromptClosed, passkeyErrorCode } from '@/lib/passkey-prompt'
import { signInUrlFor } from '@/lib/signed-out'
import { describeUserAgent } from '@/lib/user-agent-label'

const SIGN_IN_AGAIN_TOAST_ID = 'passkey-sign-in-again'

interface Passkey {
  id: string
  name: string | null
  credentialID: string
  deviceType: string
  createdAt: Date
}

export function PasskeySettings() {
  const t = useTranslations('settings')
  const tDismiss = useTranslations('common.updateBanner')
  const tCommon = useTranslations('common')
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renamingPasskey, setRenamingPasskey] = useState<Passkey | null>(null)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [passKeyToDelete, setPassKeyToDelete] = useState<Passkey | null>(null)

  const fetchPasskeys = async () => {
    try {
      const result = await authClient.passkey.listUserPasskeys()
      if (result.data) {
        setPasskeys(result.data as Passkey[])
      }
    } catch {
      // Silently fail on fetch
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPasskeys()
  }, [])

  // The sign-in page sends a signed-in visitor straight back, so this session
  // ends before the tab goes there, set to come back to this page.
  const signInAgain = async () => {
    // A sign-out that did not happen would send them to a sign-in page that
    // sends a signed-in visitor straight back here, with nothing said.
    let signedOut = true
    try {
      const result = await authClient.signOut()
      if (result?.error) signedOut = false
    } catch {
      signedOut = false
    }
    if (!signedOut) {
      toast.error(tCommon('errors.unexpected'))
      return
    }
    window.location.assign(signInUrlFor(window.location.pathname, window.location.search))
  }

  const handleRegister = async () => {
    setRegistering(true)
    try {
      // Named after the device it is made on, the way the signed-in devices
      // list names it, so a second passkey is not another "Unnamed passkey".
      const label = describeUserAgent(navigator.userAgent)
      const result = await authClient.passkey.addPasskey(
        label === 'Unknown device' ? undefined : { name: label }
      )
      if (result?.error) {
        if (isPasskeyPromptClosed(result.error)) return
        const code = passkeyErrorCode(result.error)
        // A passkey is only added to a session that began recently, and a
        // session lasts days longer than that. Better Auth's own sentence
        // ("Session is not fresh") says neither why nor what to do.
        if (code === 'SESSION_NOT_FRESH') {
          showNotice({
            id: SIGN_IN_AGAIN_TOAST_ID,
            icon: LogIn,
            title: t('account.passkey.signInAgainTitle'),
            description: t('account.passkey.signInAgainDescription'),
            actionLabel: t('account.passkey.signInAgain'),
            onAction: signInAgain,
            dismissLabel: tDismiss('dismiss'),
          })
          return
        }
        const msg = typeof result.error.message === 'string' ? result.error.message : ''
        toast.error(msg || t('account.passkey.registerFailed'))
      } else {
        toast.success(t('account.passkey.registerSuccess'))
        fetchPasskeys()
      }
    } catch {
      toast.error(t('account.passkey.registerFailed'))
    } finally {
      // Also after the early returns above, or the button would spin for good
      setRegistering(false)
    }
  }

  const handleDelete = async () => {
    if (!passKeyToDelete) return
    setDeletingId(passKeyToDelete.id)
    try {
      await authClient.passkey.deletePasskey({ id: passKeyToDelete.id })
      toast.success(t('account.passkey.deleteSuccess'))
      setPasskeys((prev) => prev.filter((p) => p.id !== passKeyToDelete.id))
    } catch {
      toast.error(t('account.passkey.deleteFailed'))
    }
    setDeletingId(null)
    setDeleteDialogOpen(false)
    setPassKeyToDelete(null)
  }

  const handleRename = async () => {
    if (!renamingPasskey || !newName.trim()) return
    setSaving(true)
    try {
      await authClient.passkey.updatePasskey({
        id: renamingPasskey.id,
        name: newName.trim(),
      })
      setPasskeys((prev) =>
        prev.map((p) => (p.id === renamingPasskey.id ? { ...p, name: newName.trim() } : p))
      )
      setRenameDialogOpen(false)
      setRenamingPasskey(null)
    } catch {
      toast.error(t('account.passkey.renameFailed'))
    }
    setSaving(false)
  }

  const formatDate = (dateStr: Date) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <>
      <AppCard
        id="account-passkeys"
        icon={Fingerprint}
        title={t('account.passkey.title')}
        contentClassName="space-y-4"
      >
        <p className="text-sm text-muted-foreground">{t('account.passkey.description')}</p>

        {loading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : passkeys.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t('account.passkey.noPasskeys')}</p>
        ) : (
          <div className="space-y-2">
            {passkeys.map((pk) => (
              <div key={pk.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{pk.name || t('account.passkey.unnamed')}</p>
                  <p className="text-xs text-muted-foreground">
                    {pk.deviceType === 'singleDevice'
                      ? t('account.passkey.singleDevice')
                      : t('account.passkey.multiDevice')}{' '}
                    &middot; {formatDate(pk.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setRenamingPasskey(pk)
                      setNewName(pk.name || '')
                      setRenameDialogOpen(true)
                    }}
                    aria-label={t('account.passkey.rename')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={deletingId === pk.id}
                    onClick={() => {
                      setPassKeyToDelete(pk)
                      setDeleteDialogOpen(true)
                    }}
                    aria-label={t('account.passkey.delete')}
                  >
                    {deletingId === pk.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Separator />
        <Button id="account-register-passkey" onClick={handleRegister} disabled={registering}>
          {registering ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {registering ? t('account.passkey.registering') : t('account.passkey.register')}
        </Button>
      </AppCard>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('account.passkey.rename')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="passkey-name">{t('account.passkey.nameLabel')}</Label>
            <Input
              id="passkey-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('account.passkey.namePlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              {t('account.passkey.cancel')}
            </Button>
            <Button onClick={handleRename} disabled={saving || !newName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('account.passkey.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('account.passkey.confirmDeleteTitle')}</DialogTitle>
            <DialogDescription>{t('account.passkey.confirmDelete')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('account.passkey.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingId !== null}>
              {deletingId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('account.passkey.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
