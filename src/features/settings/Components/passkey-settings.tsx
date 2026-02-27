'use client'

import { useState, useEffect } from 'react'
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
import { Fingerprint, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Passkey {
  id: string
  name: string | null
  credentialID: string
  deviceType: string
  createdAt: Date
}

export function PasskeySettings() {
  const t = useTranslations('settings')
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

  const handleRegister = async () => {
    setRegistering(true)
    try {
      const result = await authClient.passkey.addPasskey()
      if (result?.error) {
        toast.error(result.error.message || t('account.passkey.registerFailed'))
      } else {
        toast.success(t('account.passkey.registerSuccess'))
        fetchPasskeys()
      }
    } catch {
      toast.error(t('account.passkey.registerFailed'))
    }
    setRegistering(false)
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
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Fingerprint className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('account.passkey.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('account.passkey.description')}
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              {t('account.passkey.noPasskeys')}
            </p>
          ) : (
            <div className="space-y-2">
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {pk.name || t('account.passkey.unnamed')}
                    </p>
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
          <Button onClick={handleRegister} disabled={registering}>
            {registering ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {registering ? t('account.passkey.registering') : t('account.passkey.register')}
          </Button>
        </CardContent>
      </Card>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
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
            <DialogDescription>
              {t('account.passkey.confirmDelete')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('account.passkey.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletingId !== null}
            >
              {deletingId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('account.passkey.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
