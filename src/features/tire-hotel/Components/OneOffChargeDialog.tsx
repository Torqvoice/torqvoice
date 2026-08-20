'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { createOneOffCharge } from '../Actions/agreementActions'
import { addMonths } from '../Lib/billing'

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * A storage fee with nothing standing behind it.
 *
 * Opens filled in for the ordinary case, the season price from settings over
 * the next six months, so a counter that just wants to charge for the winter
 * can confirm and be done. Everything stays editable for the shop that prices
 * per set or stores for an odd stretch.
 *
 * The period is not decoration: it prints on the invoice line, and it is what
 * answers "what was this for" when the customer rings in March.
 */
export function OneOffChargeDialog({
  open,
  onOpenChange,
  tireSetId,
  defaultPrice,
  currency,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tireSetId: string
  defaultPrice: number
  currency: string
}) {
  const t = useTranslations('tireHotel')
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [amount, setAmount] = useState(String(defaultPrice || ''))
  const [start, setStart] = useState(isoDate(new Date()))
  const [end, setEnd] = useState(isoDate(addMonths(new Date(), 6)))

  const handleSubmit = async () => {
    setSaving(true)
    const result = await createOneOffCharge({
      tireSetId,
      amount: Number(amount) || 0,
      periodStart: start,
      periodEnd: end,
    })
    setSaving(false)

    if (!result.success) {
      toast.error(result.error ?? t('agreement.chargeFailed'))
      return
    }
    toast.success(t('agreement.chargeCreated'))
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('agreement.chargeTitle')}</DialogTitle>
          <DialogDescription>{t('agreement.chargeBody')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="oneOffAmount">{t('agreement.price', { currency })}</Label>
            <Input
              id="oneOffAmount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular-nums"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="oneOffStart">{t('agreement.startDate')}</Label>
              <Input
                id="oneOffStart"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oneOffEnd">{t('agreement.endDate')}</Label>
              <Input
                id="oneOffEnd"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !amount || end < start}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('agreement.chargeCreate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
