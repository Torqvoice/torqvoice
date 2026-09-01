'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'
import { PLAY_STORE_URL } from '@/lib/app-links'
import { Check, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Getting the code from the desk's screen onto the technician's phone.
 *
 * Shared by the two places that need it: setting somebody up for the first
 * time, and handing an existing technician a fresh code because they have a
 * new phone or nothing arrived. Identical either way, which is the point:
 * there is one thing to learn.
 */

export interface IssuedCode {
  code: string
  display: string
  expiresAt: string
  name: string
}

export function SetupCodeHandoff({
  issued,
  error,
  workshopUrl,
  memberName,
}: {
  /** Null while it is still being made. */
  issued: IssuedCode | null
  error: string | null
  workshopUrl: string
  memberName: string
}) {
  const t = useTranslations('settings')
  const [remaining, setRemaining] = useState(0)
  const [copied, setCopied] = useState(false)

  // Counts down rather than showing a clock time: "expires in 7:12" is
  // something a desk operator can act on, "expires at 14:07" is arithmetic.
  useEffect(() => {
    if (!issued) return
    const tick = () =>
      setRemaining(
        Math.max(0, Math.ceil((new Date(issued.expiresAt).getTime() - Date.now()) / 1000))
      )
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [issued])

  if (error) return <p className="text-destructive text-sm">{error}</p>

  if (!issued) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const expired = remaining <= 0
  const link = `${workshopUrl}/app-setup#${issued.code}`

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t('team.setupAppInstruction', { name: memberName })}
      </p>

      {/* Numbered, because the one-sentence version was read as "scan this"
          and everybody reaches for the phone's own camera. Step two names the
          button verbatim, in the technician's language. */}
      <ol className="space-y-2 text-sm">
        {[t('team.setupAppStep1'), t('team.setupAppStep2'), t('team.setupAppStep3')].map(
          (step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                {i + 1}
              </span>
              <span>
                {step}
                {/* The desk is often the one who finds the app for them, so
                    the first step carries the link rather than leaving
                    somebody to search the store on a stranger's phone. */}
                {i === 0 && (
                  <>
                    {' '}
                    <a
                      href={PLAY_STORE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      {t('team.setupPageInstall')}
                    </a>
                  </>
                )}
              </span>
            </li>
          )
        )}
      </ol>

      {/* White plate whatever the theme: a dark-mode QR with an inverted quiet
          zone is a QR most scanners refuse. */}
      <div className="flex justify-center rounded-lg bg-white p-6">
        <QRCodeSVG value={link} size={200} level="H" marginSize={2} />
      </div>

      <div className="space-y-1 text-center">
        <p className="text-muted-foreground text-xs">{t('team.setupAppOrType')}</p>
        <p className="font-mono font-semibold text-2xl tracking-[0.2em]">{issued.display}</p>
      </div>

      {/* The failure this exists to prevent: a technician points their own
          camera at the QR, lands on a web page, and decides it is broken. */}
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-center text-amber-700 text-xs dark:text-amber-400">
        {t('team.setupAppNotCamera')}
      </p>

      {!expired && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            navigator.clipboard
              .writeText(link)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
              .catch(() => {
                /* clipboard refused; the code is on screen to read out */
              })
          }}
        >
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? t('team.setupAppCopied') : t('team.setupAppCopyLink')}
        </Button>
      )}

      <p className="text-center text-muted-foreground text-xs">
        {expired
          ? t('team.setupAppExpired')
          : t('team.setupAppExpiry', {
              time: `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`,
            })}
      </p>
    </div>
  )
}
