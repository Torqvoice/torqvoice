'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Car, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { reportVehicleSold } from '../Actions/portalActions'

/**
 * "This car is no longer mine." One confirmation, then the workshop is told
 * and reminders about the vehicle stop. Nothing is deleted from the
 * customer's side; the workshop decides what happens to the record.
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
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(reportedAt)

  if (done) {
    return <p className="text-sm text-muted-foreground">{t('reportSoldAlready')}</p>
  }

  const submit = async () => {
    setBusy(true)
    const result = await reportVehicleSold(vehicleId)
    setBusy(false)
    if (!result.success || !result.data) {
      toast.error(result.error ?? t('reportSoldFailed'))
      return
    }
    setDone(result.data.reportedAt)
    setOpen(false)
    toast.success(t('reportSoldDone'))
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Car className="mr-1.5 h-3.5 w-3.5" />
        {t('reportSold')}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('reportSold')}</AlertDialogTitle>
            <AlertDialogDescription>{t('reportSoldHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('reportSoldCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={submit} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('reportSoldConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
