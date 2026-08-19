'use client'

import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, X } from 'lucide-react'
import { createAgreement, updateAgreement } from '../Actions/agreementActions'
import {
  STORAGE_BILLING_MODELS,
  extrasTotal,
  parseExtras,
  round2,
  type Extra,
} from '../Lib/billing'

export type EditableAgreement = {
  id: string
  billingModel: string
  price: number
  extras: unknown
  startDate: Date
  endDate: Date | null
  autoRenew: boolean
  notes: string | null
}

/** YYYY-MM-DD from the local calendar day, never the UTC one. */
function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * The commercial terms for a stored set.
 *
 * Extras are priced alongside the base rate rather than folded into it, so a
 * customer's invoice can say what the wash cost and the shop can change the
 * storage price next season without unpicking the rest.
 */
export function AgreementDialog({
  open,
  onOpenChange,
  tireSetId,
  agreement,
  defaultSeasonalPrice,
  defaultMonthlyPrice,
  currency,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tireSetId: string
  agreement?: EditableAgreement
  defaultSeasonalPrice: number
  defaultMonthlyPrice: number
  currency: string
}) {
  const router = useRouter()
  const t = useTranslations('tireHotel')
  const [saving, setSaving] = useState(false)

  const [billingModel, setBillingModel] = useState('seasonal')
  const [price, setPrice] = useState('0')
  const [extras, setExtras] = useState<Extra[]>([])
  const [startDate, setStartDate] = useState(toDateInput(new Date()))
  const [endDate, setEndDate] = useState('')
  const [autoRenew, setAutoRenew] = useState(true)
  const [notes, setNotes] = useState('')
  // Tracks whether the operator has touched the price, so switching billing
  // model can refill the default without overwriting a number they typed.
  const [priceTouched, setPriceTouched] = useState(false)

  const isEdit = !!agreement

  useEffect(() => {
    if (!open) return
    if (agreement) {
      setBillingModel(agreement.billingModel)
      setPrice(String(agreement.price))
      setExtras(parseExtras(agreement.extras))
      setStartDate(toDateInput(new Date(agreement.startDate)))
      setEndDate(agreement.endDate ? toDateInput(new Date(agreement.endDate)) : '')
      setAutoRenew(agreement.autoRenew)
      setNotes(agreement.notes ?? '')
      setPriceTouched(true)
    } else {
      setBillingModel('seasonal')
      setPrice(String(defaultSeasonalPrice))
      setExtras([])
      setStartDate(toDateInput(new Date()))
      setEndDate('')
      setAutoRenew(true)
      setNotes('')
      setPriceTouched(false)
    }
  }, [open, agreement, defaultSeasonalPrice])

  const handleBillingModel = (value: string) => {
    setBillingModel(value)
    if (!priceTouched) {
      setPrice(String(value === 'monthly' ? defaultMonthlyPrice : defaultSeasonalPrice))
    }
  }

  const total = round2((Number(price) || 0) + extrasTotal(extras))

  const handleSubmit = async () => {
    setSaving(true)
    const payload = {
      billingModel,
      price: Number(price) || 0,
      extras: extras.filter((e) => e.label.trim() !== ''),
      // Midday local, so the period lands on the day that was picked
      // whichever side of UTC the workshop sits on.
      startDate: `${startDate}T12:00:00`,
      endDate: endDate ? `${endDate}T12:00:00` : null,
      autoRenew,
      notes,
    }

    const result = isEdit
      ? await updateAgreement({ id: agreement.id, ...payload })
      : await createAgreement({ tireSetId, ...payload })

    setSaving(false)

    if (!result.success) {
      toast.error(result.error ?? t('agreement.saveFailed'))
      return
    }
    toast.success(isEdit ? t('agreement.updated') : t('agreement.created'))
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('agreement.editTitle') : t('agreement.addTitle')}</DialogTitle>
          <DialogDescription>{t('agreement.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agreementModel">{t('agreement.billingModel')}</Label>
              <Select value={billingModel} onValueChange={handleBillingModel}>
                <SelectTrigger id="agreementModel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORAGE_BILLING_MODELS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`agreement.models.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agreementPrice">{t('agreement.price', { currency })}</Label>
              <Input
                id="agreementPrice"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value)
                  setPriceTouched(true)
                }}
                className="tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                {t(`agreement.priceHint.${billingModel}`)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agreementStart">{t('agreement.startDate')}</Label>
              <Input
                id="agreementStart"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agreementEnd">{t('agreement.endDate')}</Label>
              <Input
                id="agreementEnd"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('agreement.endDateHint')}</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="agreementRenew">{t('agreement.autoRenew')}</Label>
              <p className="text-xs text-muted-foreground">{t('agreement.autoRenewHint')}</p>
            </div>
            <Switch id="agreementRenew" checked={autoRenew} onCheckedChange={setAutoRenew} />
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('agreement.extras')}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => setExtras([...extras, { label: '', price: 0 }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t('agreement.addExtra')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('agreement.extrasHint')}</p>

            {extras.map((extra, index) => (
              // Index key: rows have no id, and reordering is not offered.
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={extra.label}
                  onChange={(e) =>
                    setExtras(
                      extras.map((x, i) => (i === index ? { ...x, label: e.target.value } : x))
                    )
                  }
                  placeholder={t('agreement.extraLabelPlaceholder')}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={extra.price}
                  onChange={(e) =>
                    setExtras(
                      extras.map((x, i) =>
                        i === index ? { ...x, price: Number(e.target.value) || 0 } : x
                      )
                    )
                  }
                  className="w-28 tabular-nums"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setExtras(extras.filter((_, i) => i !== index))}
                  aria-label={t('agreement.removeExtra')}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-baseline justify-between rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              {t(`agreement.perPeriod.${billingModel}`)}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {total.toFixed(2)} {currency}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agreementNotes">{t('agreement.notes')}</Label>
            <Textarea
              id="agreementNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t('common.save') : t('agreement.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
