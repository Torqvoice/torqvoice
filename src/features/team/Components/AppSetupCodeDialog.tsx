'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createAppSetupCode, revokeAppSetupCode } from '@/features/team/Actions/createAppSetupCode'
import { type IssuedCode, SetupCodeHandoff } from './SetupCodeHandoff'

/**
 * A fresh code for somebody who is already a technician.
 *
 * Setting them up the first time happens inside the add flow, where it is one
 * step of several. This is the other occasion: a new phone, a factory reset,
 * or a message that never turned up. Same code, same instructions, same
 * screen, so there is one thing to learn rather than two.
 *
 * The code is shown once and never fetched again. Closing this revokes it, so
 * one left up on an unattended screen stops working when whoever made it
 * walks away.
 */
export function AppSetupCodeDialog({
  userId,
  memberName,
  workshopUrl,
  onClose,
}: {
  /** The member being set up. Null when the dialog is closed. */
  userId: string | null
  memberName: string
  workshopUrl: string
  onClose: () => void
}) {
  const t = useTranslations('settings')
  const [issued, setIssued] = useState<IssuedCode | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setIssued(null)
      setError(null)
      return
    }
    let cancelled = false
    setIssued(null)
    setError(null)
    createAppSetupCode({ userId }).then((result) => {
      if (cancelled) return
      if (result.success) setIssued(result.data as IssuedCode)
      else setError(result.error || t('team.setupAppFailed'))
    })
    return () => {
      cancelled = true
    }
  }, [userId, t])

  const close = useCallback(() => {
    // Not awaited: the dialog should shut the moment it is asked to, and the
    // revoke is the server's problem. Belt and braces anyway, since the code
    // expires on its own.
    if (userId) void revokeAppSetupCode({ userId })
    onClose()
  }, [userId, onClose])

  return (
    <Dialog open={userId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            {t('team.setupAppTitle')}
          </DialogTitle>
          <DialogDescription>{t('team.techHandoffBlurb')}</DialogDescription>
        </DialogHeader>

        <SetupCodeHandoff
          issued={issued}
          error={error}
          workshopUrl={workshopUrl}
          memberName={memberName}
        />

        <Button variant="secondary" onClick={close} className="w-full">
          {t('team.setupAppDone')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
