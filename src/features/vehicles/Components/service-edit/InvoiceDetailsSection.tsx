'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InitialData } from './form-types'

interface InvoiceDetailsSectionProps {
  initialData: InitialData
  type: string
  setType: (type: string) => void
  status: string
  setStatus: (status: string) => void
  onDirty?: () => void
  paymentStatus: string
  onTogglePaid: () => void
  paymentLoading?: boolean
}

export function InvoiceDetailsSection({
  initialData,
  type,
  setType,
  status,
  setStatus,
  onDirty,
  paymentStatus,
  onTogglePaid,
  paymentLoading,
}: InvoiceDetailsSectionProps) {
  const t = useTranslations('service.basicInfo')
  // ISO YYYY-MM-DD strings, matching the native date input's value format
  const [invoiceDate, setInvoiceDate] = useState(initialData.invoiceDate || '')
  const [invoiceDueDate, setInvoiceDueDate] = useState(initialData.invoiceDueDate || '')

  useEffect(() => {
    setInvoiceDate(initialData.invoiceDate || '')
  }, [initialData.invoiceDate])

  useEffect(() => {
    setInvoiceDueDate(initialData.invoiceDueDate || '')
  }, [initialData.invoiceDueDate])

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('invoiceDetails')}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-7 text-xs', paymentStatus === 'paid' && 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800')}
          onClick={onTogglePaid}
          disabled={paymentLoading}
        >
          {paymentLoading ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Check className="mr-1 h-3 w-3" />
          )}
          {paymentStatus === 'paid' ? t('paid') : t('markPaid')}
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="title" className="text-xs">{t('titleLabel')}</Label>
        <Input
          id="title"
          name="title"
          placeholder={t('titlePlaceholder')}
          defaultValue={initialData.title}
          maxLength={100}
          required
        />
      </div>

      {/* Hidden serviceDate — kept for form submission */}
      <input
        type="hidden"
        name="serviceDate"
        value={initialData.serviceDate || new Date().toISOString().split('T')[0]}
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t('type')}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="maintenance">{t('typeOptions.maintenance')}</SelectItem>
              <SelectItem value="repair">{t('typeOptions.repair')}</SelectItem>
              <SelectItem value="upgrade">{t('typeOptions.upgrade')}</SelectItem>
              <SelectItem value="inspection">{t('typeOptions.inspection')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('status')}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">{t('statusOptions.pending')}</SelectItem>
              <SelectItem value="in-progress">{t('statusOptions.in_progress')}</SelectItem>
              <SelectItem value="waiting-parts">{t('statusOptions.waiting_parts')}</SelectItem>
              <SelectItem value="completed">{t('statusOptions.completed')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="invoiceNumber" className="text-xs">{t('invoiceNumber')}</Label>
        <Input
          id="invoiceNumber"
          name="invoiceNumber"
          placeholder="2026-1001"
          defaultValue={initialData.invoiceNumber || ''}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="invoiceDate" className="text-xs">{t('invoiceDate')}</Label>
          <DateInput
            id="invoiceDate"
            name="invoiceDate"
            value={invoiceDate}
            onChange={(v) => { setInvoiceDate(v); onDirty?.() }}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invoiceDueDate" className="text-xs">{t('invoiceDueDate')}</Label>
          <DateInput
            id="invoiceDueDate"
            name="invoiceDueDate"
            value={invoiceDueDate}
            onChange={(v) => { setInvoiceDueDate(v); onDirty?.() }}
            className="h-9 text-sm"
          />
        </div>
      </div>
    </div>
  )
}
