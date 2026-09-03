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
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { setInvoiceDesign } from '@/features/invoices/Actions/invoiceDesignActions'
import type { InitialData } from './form-types'

export interface DesignOption {
  id: string
  name: string
}

/** The value the picker uses for "follow the default": Radix reserves "". */
const FOLLOW_DEFAULT = '__default__'

interface InvoiceDetailsSectionProps {
  initialData: InitialData
  type: string
  setType: (type: string) => void
  /** Counter sales (no vehicle) have no meaningful service type; hide the field. */
  showType?: boolean
  status: string
  setStatus: (status: string) => void
  onDirty?: () => void
  paymentStatus: string
  onTogglePaid: () => void
  paymentLoading?: boolean
  /** The workshop's saved invoice designs. No picker when there are none. */
  designOptions?: DesignOption[]
  /** The design this invoice chose, or null to follow the default. */
  designId?: string | null
  /** What "default" resolves to for this invoice, when it has a name. */
  designFollowsName?: string | null
  /** When the sheet was frozen, ISO. Set only while it prints from that copy. */
  designPinnedAt?: string | null
}

export function InvoiceDetailsSection({
  initialData,
  type,
  setType,
  showType = true,
  status,
  setStatus,
  onDirty,
  paymentStatus,
  onTogglePaid,
  paymentLoading,
  designOptions = [],
  designId = null,
  designFollowsName = null,
  designPinnedAt = null,
}: InvoiceDetailsSectionProps) {
  const t = useTranslations('service.basicInfo')
  const router = useRouter()
  // Saved on change rather than with the form: the choice is its own edit,
  // the way the schedule card's technician is, and must not wait for a save
  // of lines it has nothing to do with.
  const [design, setDesign] = useState(designId ?? FOLLOW_DEFAULT)
  const [savingDesign, setSavingDesign] = useState(false)
  useEffect(() => {
    setDesign(designId ?? FOLLOW_DEFAULT)
  }, [designId])

  const changeDesign = async (value: string) => {
    const previous = design
    setDesign(value)
    setSavingDesign(true)
    const result = await setInvoiceDesign(initialData.id, value === FOLLOW_DEFAULT ? null : value)
    setSavingDesign(false)
    if (result.success) {
      toast.success(t('designSaved'))
      router.refresh()
    } else {
      setDesign(previous)
      toast.error(t('designSaveFailed'))
    }
  }
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
          className={cn(
            'h-7 text-xs',
            paymentStatus === 'paid' &&
              'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800'
          )}
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
        <Label htmlFor="title" className="text-xs">
          {t('titleLabel')}
        </Label>
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

      <div className={showType ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
        {showType && (
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
        )}
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
        <Label htmlFor="invoiceNumber" className="text-xs">
          {t('invoiceNumber')}
        </Label>
        <Input
          id="invoiceNumber"
          name="invoiceNumber"
          placeholder="2026-1001"
          defaultValue={initialData.invoiceNumber || ''}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="invoiceDate" className="text-xs">
            {t('invoiceDate')}
          </Label>
          <DateInput
            id="invoiceDate"
            name="invoiceDate"
            value={invoiceDate}
            onChange={(v) => {
              setInvoiceDate(v)
              onDirty?.()
            }}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invoiceDueDate" className="text-xs">
            {t('invoiceDueDate')}
          </Label>
          <DateInput
            id="invoiceDueDate"
            name="invoiceDueDate"
            value={invoiceDueDate}
            onChange={(v) => {
              setInvoiceDueDate(v)
              onDirty?.()
            }}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {designOptions.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">{t('design')}</Label>
          <Select value={design} onValueChange={(v) => void changeDesign(v)}>
            <SelectTrigger className="w-full" disabled={savingDesign}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FOLLOW_DEFAULT}>
                {designFollowsName
                  ? t('designFollowing', { name: designFollowsName })
                  : t('designDefault')}
              </SelectItem>
              {designOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {designPinnedAt && (
            <p className="text-xs text-muted-foreground">
              {t('designPinned', { date: new Date(designPinnedAt).toLocaleDateString() })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
