'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Ban, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormatCurrency } from '@/components/currency-settings-context'

export interface CancelInvoiceRequest {
  refund: { amount: number; method: 'cash' | 'card' | 'transfer' | 'other'; note?: string } | null
}

/**
 * Cancelling an invoice that went out, which is what Delete becomes once the
 * customer holds it. Says what happens to the job and its number, and, when
 * money has been taken, says how much and offers to book what is handed back
 * as a refund. Nothing is refunded unless the box is ticked.
 */
export function CancelInvoiceDialog({
  open,
  onOpenChange,
  invoiceNumber,
  paid,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceNumber: string | null
  /** What the customer has paid on it; nothing to refund when 0. */
  paid: number
  /** Resolves once the cancel has been answered; a refusal is shown by the caller. */
  onConfirm: (request: CancelInvoiceRequest) => Promise<void>
}) {
  const t = useTranslations('service.cancelInvoice')
  const tPay = useTranslations('service.payments')
  const fmt = useFormatCurrency()
  const [refund, setRefund] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer' | 'other'>('transfer')
  const [busy, setBusy] = useState(false)

  // Each opening starts from what was paid, the usual refund.
  useEffect(() => {
    if (!open) return
    setRefund(false)
    setAmount(paid > 0 ? paid.toFixed(2) : '')
    setMethod('transfer')
  }, [open, paid])

  const value = Number(amount)
  const tooMuch = refund && value > paid + 0.005
  const invalid = refund && (!Number.isFinite(value) || value <= 0 || tooMuch)

  const confirm = async () => {
    if (invalid || busy) return
    setBusy(true)
    try {
      await onConfirm({
        refund: refund
          ? { amount: Math.round(value * 100) / 100, method, note: t('refundNote') }
          : null,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg" data-testid="cancel-invoice-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="size-5 text-destructive" aria-hidden="true" />
            {invoiceNumber ? t('title', { number: invoiceNumber }) : t('titleNoNumber')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t('pointKept')}</li>
            <li>{t('pointShown')}</li>
            <li>{t('pointReports')}</li>
            <li>{t('pointLedger')}</li>
          </ul>
          {paid > 0 && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium" data-testid="cancel-invoice-paid">
                {t('paidNotice', { amount: fmt(paid) })}
              </p>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="cancel-refund"
                  checked={refund}
                  onCheckedChange={(checked) => setRefund(checked === true)}
                />
                <Label htmlFor="cancel-refund" className="text-sm font-normal leading-snug">
                  {t('recordRefund')}
                </Label>
              </div>
              {refund ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="cancel-refund-amount" className="text-xs">
                      {t('refundAmount')}
                    </Label>
                    <Input
                      id="cancel-refund-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={paid.toFixed(2)}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      aria-invalid={tooMuch || undefined}
                    />
                    {tooMuch && (
                      <p className="text-xs text-destructive">
                        {t('refundTooMuch', { amount: fmt(paid) })}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('refundMethod')}</Label>
                    <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">{tPay('methodOptions.cash')}</SelectItem>
                        <SelectItem value="card">{tPay('methodOptions.card')}</SelectItem>
                        <SelectItem value="transfer">{tPay('methodOptions.transfer')}</SelectItem>
                        <SelectItem value="other">{tPay('methodOptions.other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('noRefundHint')}</p>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('keep')}
          </Button>
          <Button type="button" variant="destructive" disabled={busy || invalid} onClick={confirm}>
            {busy && <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />}
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
