'use client'

import { ShieldCheck, ShieldOff, Trash2, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { deletePlatformUser } from '../Actions/deletePlatformUser'
import { grantSuperAdmin } from '../Actions/grantSuperAdmin'
import { revokeSuperAdmin } from '../Actions/revokeSuperAdmin'

type AccountUser = {
  id: string
  name: string
  email: string
  isSuperAdmin: boolean
  isSelf: boolean
  organizations: { id: string; name: string; memberCount: number }[]
}

/**
 * Everything the platform admin can do to one account, in one place at the
 * foot of that account's own page. The list of accounts carries none of it:
 * a list is scrolled with a thumb, and a stray tap there must cost nothing.
 *
 * Deleting and granting platform rights both ask for the account's email to
 * be typed, so the button that does it is dead until the admin has read who
 * it is about. The server checks the same address again.
 */
export function AccountActions({ user }: { user: AccountUser }) {
  const t = useTranslations('admin.accountActions')
  const router = useRouter()
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()

  const subject = [{ label: user.name, detail: user.email, icon: User }]

  const handleGrant = async () => {
    const confirmed = await confirm({
      title: t('grantTitle'),
      icon: ShieldCheck,
      subject,
      consequences: [t('grantConsequenceAccess'), t('grantConsequenceGrant')],
      requireText: user.email,
      confirmLabel: t('grant'),
      destructive: true,
    })
    if (!confirmed) return

    startTransition(async () => {
      // An action that cannot reach the server throws instead of answering, so
      // it is caught and reported the way a refusal is.
      const result = await grantSuperAdmin({ userId: user.id, confirmEmail: user.email }).catch(
        () => null
      )
      if (result?.success) {
        toast.success(t('granted', { name: user.name }))
        router.refresh()
      } else {
        toast.error(result?.error ?? t('failed'))
      }
    })
  }

  const handleRevoke = async () => {
    const confirmed = await confirm({
      title: t('revokeTitle'),
      icon: ShieldOff,
      subject,
      consequences: [t('revokeConsequence')],
      confirmLabel: t('revoke'),
      defaultFocus: 'cancel',
    })
    if (!confirmed) return

    startTransition(async () => {
      const result = await revokeSuperAdmin({ userId: user.id }).catch(() => null)
      if (result?.success) {
        toast.success(t('revoked', { name: user.name }))
        router.refresh()
      } else {
        toast.error(result?.error ?? t('failed'))
      }
    })
  }

  const handleDelete = async () => {
    // A workshop with nobody else in it goes with the account; say which.
    const alone = user.organizations.filter((org) => org.memberCount <= 1)
    const shared = user.organizations.length > alone.length
    const confirmed = await confirm({
      title: t('deleteTitle'),
      icon: Trash2,
      subject,
      consequences: [
        ...alone.map((org) => t('deleteWorkshop', { name: org.name })),
        ...(shared ? [t('deleteShared')] : []),
        t('deleteSignedOut'),
      ],
      irreversible: true,
      requireText: user.email,
      confirmLabel: t('delete'),
      destructive: true,
    })
    if (!confirmed) return

    startTransition(async () => {
      const result = await deletePlatformUser({ userId: user.id, confirmEmail: user.email }).catch(
        () => null
      )
      if (result?.success) {
        toast.success(t('deleted', { name: user.name }))
        router.push('/admin/users')
      } else {
        toast.error(result?.error ?? t('failed'))
      }
    })
  }

  return (
    <section aria-labelledby="account-actions-title">
      <h2 id="account-actions-title" className="mb-3 text-lg font-semibold">
        {t('title')}
      </h2>
      <Card className={user.isSelf ? undefined : 'py-0'}>
        {user.isSelf ? (
          <CardContent className="text-sm text-muted-foreground">{t('ownAccount')}</CardContent>
        ) : (
          <CardContent className="divide-y p-0 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
              <div className="min-w-0">
                <p className="font-medium">{t('superAdmin')}</p>
                <p className="text-muted-foreground">
                  {user.isSuperAdmin ? t('superAdminHintRevoke') : t('superAdminHintGrant')}
                </p>
              </div>
              {user.isSuperAdmin ? (
                <Button variant="outline" disabled={isPending} onClick={handleRevoke}>
                  <ShieldOff />
                  {t('revoke')}
                </Button>
              ) : (
                <Button variant="outline" disabled={isPending} onClick={handleGrant}>
                  <ShieldCheck />
                  {t('grant')}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
              <div className="min-w-0">
                <p className="font-medium">{t('delete')}</p>
                <p className="text-muted-foreground">
                  {user.isSuperAdmin ? t('deleteHintSuperAdmin') : t('deleteHint')}
                </p>
              </div>
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={isPending || user.isSuperAdmin}
                onClick={handleDelete}
              >
                <Trash2 />
                {t('delete')}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </section>
  )
}
