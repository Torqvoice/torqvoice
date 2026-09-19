'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, CreditCard, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { useFormatDate } from '@/lib/use-format-date'
import { paymentStatusColors, paymentStatusLabels } from './types'
import type { Payment } from './types'
import { useModernWorkOrder } from '@/components/work-order-layout-context'

interface PaymentsSectionProps {
  payments: Payment[]
  paymentStatus: string
  manuallyPaid: boolean
  totalPaid: number
  displayTotal: number
  balanceDue: number
  currencyCode: string
  onCreatePayment: (data: {
    amount: number
    date: string
    method: string
    note?: string
  }) => Promise<boolean>
  onDeletePayment: (id: string) => void
  onTogglePaid: () => void
  paymentLoading: boolean
  deletingPayment: string | null
  /**
   * Bumped by something elsewhere on the page that wants a payment taken (the
   * bar along the bottom of the overhauled page): the form opens and is
   * brought into view. The number only has to change; its value means nothing.
   */
  openFormSignal?: number
}

export function PaymentsSection({
  payments,
  paymentStatus,
  manuallyPaid,
  totalPaid,
  displayTotal,
  balanceDue,
  currencyCode,
  onCreatePayment,
  onDeletePayment,
  onTogglePaid,
  paymentLoading,
  deletingPayment,
  openFormSignal = 0,
}: PaymentsSectionProps) {
  const formatCurrency = useFormatCurrency()
  const t = useTranslations('service.payments')
  const tc = useTranslations('common.buttons')
  const modern = useModernWorkOrder()
  const [showForm, setShowForm] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('other')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const { formatDate } = useFormatDate()
  const formRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (openFormSignal === 0) return
    setShowForm(true)
    // After the form has been drawn, so the view lands on it and not above it.
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      formRef.current?.querySelector<HTMLInputElement>('[name="paymentAmount"]')?.focus()
    })
  }, [openFormSignal])

  const handleSubmit = async () => {
    if (!formRef.current) return
    const amount = formRef.current.querySelector<HTMLInputElement>('[name="paymentAmount"]')
    const date = formRef.current.querySelector<HTMLInputElement>('[name="paymentDate"]')
    const note = formRef.current.querySelector<HTMLInputElement>('[name="paymentNote"]')
    if (!amount?.value || Number(amount.value) <= 0) return
    const success = await onCreatePayment({
      amount: Number(amount.value),
      date: date?.value || new Date().toISOString(),
      method: paymentMethod,
      note: note?.value || undefined,
    })
    if (success) {
      setShowForm(false)
      setPaymentMethod('other')
    }
  }

  // This sits inside the work order form, where Enter would save the whole job
  // (and on a locked invoice be refused). Here Enter records the payment.
  const paymentForm = (
    <div
      ref={formRef}
      className="space-y-3 rounded-lg border p-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault()
          if (!paymentLoading) void handleSubmit()
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="paymentAmount" className="text-xs">
            {t('amount')}
          </Label>
          <Input
            id="paymentAmount"
            name="paymentAmount"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={balanceDue > 0 ? balanceDue.toFixed(2) : ''}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="paymentDate" className="text-xs">
            {t('date')}
          </Label>
          <DateInput
            id="paymentDate"
            name="paymentDate"
            value={paymentDate}
            onChange={setPaymentDate}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('method')}</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">{t('methodOptions.cash')}</SelectItem>
              <SelectItem value="card">{t('methodOptions.card')}</SelectItem>
              <SelectItem value="transfer">{t('methodOptions.transfer')}</SelectItem>
              <SelectItem value="other">{t('methodOptions.other')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="paymentNote" className="text-xs">
            {t('note')}
          </Label>
          <Input id="paymentNote" name="paymentNote" placeholder={t('notePlaceholder')} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={paymentLoading} onClick={handleSubmit}>
          {paymentLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {t('savePayment')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
          {tc('cancel')}
        </Button>
      </div>
    </div>
  )

  // The overhauled page draws this inside its invoice card: no frame, what
  // has come in as one line each, the balance as the figure nobody can miss,
  // and taking a payment as the one big button under it.
  if (modern) {
    return (
      <div ref={sectionRef} className="space-y-3" data-testid="payments-section">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('received')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={paymentLoading}
            onClick={onTogglePaid}
          >
            {paymentLoading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : manuallyPaid ? (
              <X className="mr-1 h-3 w-3" />
            ) : (
              <Check className="mr-1 h-3 w-3" />
            )}
            {manuallyPaid ? t('markUnpaid') : t('markPaid')}
          </Button>
        </div>

        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noneYet')}</p>
        ) : (
          <ul className="space-y-1.5">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"
              >
                <span className="min-w-0 truncate">
                  <strong className="font-semibold capitalize">{payment.method}</strong>
                  {' · '}
                  {formatDate(new Date(payment.date))}
                  {payment.note ? ` · ${payment.note}` : ''}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="font-mono font-medium tabular-nums">
                    {formatCurrency(-payment.amount, currencyCode)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-current opacity-60 hover:bg-transparent hover:text-destructive hover:opacity-100"
                    disabled={deletingPayment === payment.id}
                    onClick={() => onDeletePayment(payment.id)}
                    aria-label={tc('delete')}
                  >
                    {deletingPayment === payment.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-baseline justify-between rounded-lg bg-foreground px-4 py-4 text-background">
          <span className="text-xs font-medium uppercase tracking-wider opacity-70">
            {t('balanceDue')}
          </span>
          <span
            className="order-number text-3xl font-bold leading-none tabular-nums"
            data-testid="balance-due"
          >
            {formatCurrency(balanceDue, currencyCode)}
          </span>
        </div>

        {showForm ? (
          paymentForm
        ) : (
          <Button type="button" className="h-11 w-full" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('recordPayment')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-3.5 w-3.5" />
              {t('title')}
            </h3>
            <Badge
              variant="outline"
              className={`text-xs ${paymentStatusColors[paymentStatus] || ''}`}
            >
              {paymentStatusLabels[paymentStatus] || 'Unpaid'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={paymentLoading}
              onClick={onTogglePaid}
            >
              {paymentLoading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : manuallyPaid ? (
                <X className="mr-1 h-3 w-3" />
              ) : (
                <Check className="mr-1 h-3 w-3" />
              )}
              {manuallyPaid ? t('markUnpaid') : t('markPaid')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowForm(!showForm)}
            >
              <Plus className="mr-1 h-3 w-3" />
              {t('recordPayment')}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('totalPaid')}</span>
            <span className="font-medium">
              {formatCurrency(totalPaid, currencyCode)} /{' '}
              {formatCurrency(displayTotal, currencyCode)}
            </span>
          </div>

          {showForm && paymentForm}

          {payments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-1.5 font-medium">{t('date')}</th>
                    <th className="pb-1.5 text-right font-medium">{t('amount')}</th>
                    <th className="pb-1.5 font-medium">{t('method')}</th>
                    <th className="pb-1.5 font-medium">{t('note')}</th>
                    <th className="pb-1.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-1.5">{formatDate(new Date(payment.date))}</td>
                      <td className="py-1.5 text-right font-medium">
                        {formatCurrency(payment.amount, currencyCode)}
                      </td>
                      <td className="py-1.5">
                        <Badge variant="outline" className="text-xs capitalize">
                          {payment.method}
                        </Badge>
                      </td>
                      <td className="py-1.5 text-muted-foreground">{payment.note || '-'}</td>
                      <td className="py-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              disabled={deletingPayment === payment.id}
                              onClick={() => onDeletePayment(payment.id)}
                              aria-label={tc('delete')}
                            >
                              {deletingPayment === payment.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tc('delete')}</TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
