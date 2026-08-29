'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'
import { Loader2, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createAppSetupCode, revokeAppSetupCode } from '@/features/team/Actions/createAppSetupCode'

/**
 * The desk's half of putting a technician's phone onto the workshop.
 *
 * Designed for two people standing at a counter with the car outside: the
 * screen shows a QR, the phone reads it, and nothing is typed. The characters
 * underneath are for the technician who has already left and is on the phone.
 *
 * The code is shown once and never fetched again. Closing this revokes it, so
 * a code left up on an unattended screen stops working when whoever made it
 * walks away.
 */

interface Issued {
  code: string
  display: string
  expiresAt: string
  name: string
}

export function AppSetupCodeDialog({
  userId,
  memberName,
  workshopUrl,
  onClose,
}: {
  /** The member being set up. Null when the dialog is closed. */
  userId: string | null
  memberName: string
  /** The address the app should connect to, which is this server. */
  workshopUrl: string
  onClose: () => void
}) {
  const t = useTranslations('settings')
  const [issued, setIssued] = useState<Issued | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)

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
      if (result.success) setIssued(result.data as Issued)
      else setError(result.error || t('team.setupAppFailed'))
    })
    return () => {
      cancelled = true
    }
  }, [userId, t])

  // Counts down rather than showing a clock time, because "expires in 7:12" is
  // something a desk operator can act on and "expires at 14:07" is arithmetic.
  useEffect(() => {
    if (!issued) return
    const tick = () => {
      const left = Math.max(0, new Date(issued.expiresAt).getTime() - Date.now())
      setRemaining(Math.ceil(left / 1000))
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [issued])

  const close = useCallback(() => {
    // Not awaited: the dialog should shut the moment it is asked to, and the
    // revoke is the server's problem. It is also belt and braces, since the
    // code expires on its own.
    if (userId) void revokeAppSetupCode({ userId })
    onClose()
  }, [userId, onClose])

  const expired = issued !== null && remaining <= 0
  const minutes = Math.floor(remaining / 60)
  const seconds = String(remaining % 60).padStart(2, '0')

  return (
    <Dialog open={userId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            {t('team.setupAppTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('team.setupAppInstruction', { name: memberName })}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {!issued && !error && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {issued && (
          <div className="space-y-4">
            {/* White plate behind it regardless of theme: a dark-mode QR with
                an inverted quiet zone is a QR most scanners refuse. */}
            <div className="flex justify-center rounded-lg bg-white p-6">
              <QRCodeSVG
                value={JSON.stringify({ v: 1, url: workshopUrl, code: issued.code })}
                size={200}
                level="H"
                marginSize={2}
              />
            </div>

            <div className="space-y-1 text-center">
              <p className="text-muted-foreground text-xs">{t('team.setupAppOrType')}</p>
              <p className="font-mono font-semibold text-2xl tracking-[0.2em]">{issued.display}</p>
            </div>

            <p className="text-center text-muted-foreground text-xs">
              {expired
                ? t('team.setupAppExpired')
                : t('team.setupAppExpiry', { time: `${minutes}:${seconds}` })}
            </p>
          </div>
        )}

        <Button variant="secondary" onClick={close} className="w-full">
          {t('team.setupAppDone')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
