'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createAppSetupCode, revokeAppSetupCode } from '@/features/team/Actions/createAppSetupCode'
import { giveTechnicianTheApp } from '@/features/team/Actions/giveTechnicianTheApp'
import { useTechnicianConnected } from '@/features/team/hooks/useTechnicianConnected'
import { CountryPicker } from './CountryPicker'
import { countriesFor } from '@/features/team/Lib/dialCodes'
import { type IssuedCode, SetupCodeHandoff } from './SetupCodeHandoff'
import { useLocale } from 'next-intl'

/**
 * Giving a board-only technician the app, later.
 *
 * A name on the board is often temporary: an apprentice who stays, or a
 * mechanic whose phone the app did not support when they started. Both need a
 * way forward that keeps every job and hour already recorded against them,
 * which means attaching an account to the row rather than starting a new one
 * beside it.
 *
 * Same two steps as adding a mechanic from scratch, minus the name, because
 * that is already known.
 */
export function GiveAppDialog({
  technician,
  workshopUrl,
  dialCode,
  onClose,
  onChanged,
}: {
  /** The board-only technician being given an account. Null when closed. */
  technician: { id: string; name: string } | null
  workshopUrl: string
  dialCode: string
  onClose: () => void
  onChanged: () => void
}) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const [phone, setPhone] = useState('')
  const [region, setRegion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ userId: string; name: string } | null>(null)
  const [issued, setIssued] = useState<IssuedCode | null>(null)
  const [scanned, setScanned] = useState(false)

  const country = dialCode || countriesFor(locale).find((c) => c.region === region)?.dial || ''

  useTechnicianConnected(created && !scanned ? created.userId : null, () => setScanned(true))

  const close = useCallback(() => {
    if (created && !scanned) void revokeAppSetupCode({ userId: created.userId })
    onClose()
    setTimeout(() => {
      setPhone('')
      setRegion('')
      setError(null)
      setCreated(null)
      setIssued(null)
      setScanned(false)
    }, 200)
  }, [created, scanned, onClose])

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (busy || !technician || !phone.trim()) return
      setBusy(true)
      setError(null)

      const result = await giveTechnicianTheApp({
        technicianId: technician.id,
        phone: phone.trim(),
        dialCode: country || undefined,
      })
      if (!result.success) {
        setError(result.error || t('team.addTechnicianFailed'))
        setBusy(false)
        return
      }

      const person = result.data as { userId: string; name: string }
      setCreated(person)
      onChanged()

      const code = await createAppSetupCode({ userId: person.userId })
      if (code.success) setIssued(code.data as IssuedCode)
      else setError(code.error || t('team.setupAppFailed'))
      setBusy(false)
    },
    [busy, technician, phone, country, onChanged, t]
  )

  const preview = (() => {
    const digits = phone.replace(/[\s()-]/g, '')
    if (!digits) return ''
    if (/^(\+|00)/.test(digits)) return digits.replace(/^00/, '+')
    return country ? `${country}${digits.replace(/^0+/, '')}` : ''
  })()

  return (
    <Dialog open={technician !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            {t('team.giveAppTitle', { name: technician?.name ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('team.giveAppBlurb')}</DialogDescription>
        </DialogHeader>

        {!created && (
          <form onSubmit={submit} className="space-y-4">
            {!dialCode && (
              <div className="space-y-2">
                <Label>{t('team.workshopCountry')}</Label>
                <CountryPicker value={region} onChange={setRegion} disabled={busy} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="give-phone">{t('team.technicianPhone')}</Label>
              <Input
                id="give-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('team.technicianPhonePlaceholder')}
                autoComplete="off"
                required
              />
              {preview ? (
                <p className="text-xs">
                  {t('team.phonePreview')}{' '}
                  <span className="font-medium tabular-nums">{preview}</span>
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs">{t('team.giveAppKeepsHistory')}</p>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy || !phone.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('team.giveAppSubmit')}
            </Button>
          </form>
        )}

        {created && (
          <>
            {scanned ? (
              <div className="space-y-2 py-4 text-center">
                <p className="font-medium">{t('team.stepScannedTitle', { name: created.name })}</p>
                <p className="text-muted-foreground text-sm">{t('team.stepDoneBody')}</p>
              </div>
            ) : (
              <SetupCodeHandoff
                issued={issued}
                error={error}
                workshopUrl={workshopUrl}
                memberName={created.name}
              />
            )}
            <Button className="w-full" onClick={close}>
              {t('team.setupAppDone')}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
