'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { reportVehicleSold } from '../Actions/portalActions'
import { PortalButton, PortalNotice } from './Ui'

/**
 * "This car is no longer mine." One confirmation, then the workshop is told
 * and reminders about the vehicle stop. Nothing is deleted from the
 * customer's side; the workshop decides what happens to the record.
 *
 * The question is asked in place, where the button was (no dialog, so it
 * keeps the portal's theme), and the answer stands there afterwards.
 */
export function ReportSoldButton({
  vehicleId,
  reportedAt,
}: {
  vehicleId: string
  /** Already reported: show that instead of the button. */
  reportedAt: string | null
}) {
  const t = useTranslations('portal.vehicles')
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [done, setDone] = useState<string | null>(reportedAt)
  // Said once, right after telling the workshop; later visits read the plain fact.
  const [justDone, setJustDone] = useState(false)

  if (done) {
    return (
      <p role="status" className="p-muted text-[15px]">
        {justDone ? t('reportSoldDone') : t('reportSoldAlready')}
      </p>
    )
  }

  const submit = async () => {
    setBusy(true)
    setFailed(false)
    const result = await reportVehicleSold(vehicleId).catch(() => ({ success: false as const }))
    setBusy(false)
    if (!result.success || !('data' in result) || !result.data) {
      // The server's reason is English; the customer reads their own language.
      setFailed(true)
      return
    }
    setJustDone(true)
    setDone(result.data.reportedAt)
  }

  if (!asking) {
    return (
      <PortalButton variant="ghost" block onClick={() => setAsking(true)}>
        {t('reportSold')}
      </PortalButton>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px]">
        <span className="font-semibold">{t('reportSold')}</span>{' '}
        <span className="p-muted">{t('reportSoldHint')}</span>
      </p>
      {failed && (
        <PortalNotice tone="danger" role="alert">
          {t('reportSoldFailed')}
        </PortalNotice>
      )}
      <div className="flex flex-col gap-2.5">
        <PortalButton variant="strong" block pending={busy} onClick={submit}>
          {t('reportSoldConfirm')}
        </PortalButton>
        <PortalButton block disabled={busy} onClick={() => setAsking(false)}>
          {t('reportSoldCancel')}
        </PortalButton>
      </div>
    </div>
  )
}
