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
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { Check, ClipboardList, FilePlus2, FileText, Loader2 } from 'lucide-react'
import { getOpenInvoicesForCharge, invoiceCharge } from '../Actions/agreementActions'
import type { ChargeTarget } from '../Lib/billing'

type OpenInvoice = {
  id: string
  title: string
  invoiceNumber: string | null
  status: string
  totalAmount: number
  serviceDate: Date
  vehicle: { licensePlate: string | null; make: string; model: string } | null
}

/**
 * Where this period's charge should land.
 *
 * The shop's setting decides the default, but the choice is offered every
 * time because the right answer changes case by case: a customer collecting
 * tires during a service wants one bill, a customer who only stores wants
 * their own. Open jobs are listed with their plate and total so picking the
 * right one does not require opening each.
 */
export function InvoiceChargeDialog({
  open,
  onOpenChange,
  chargeId,
  amount,
  currency,
  hasVehicle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chargeId: string
  amount: number
  currency: string
  /** A work order needs a vehicle to hang off, so the option only appears
   *  when the set has one. */
  hasVehicle: boolean
}) {
  const t = useTranslations('tireHotel')
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [invoices, setInvoices] = useState<OpenInvoice[]>([])
  const [target, setTarget] = useState<ChargeTarget>('new_invoice')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setTarget('new_invoice')
      setSelected(null)
      setInvoices([])
      return
    }
    let cancelled = false
    setLoading(true)
    getOpenInvoicesForCharge(chargeId).then((result) => {
      if (cancelled) return
      setInvoices(result.success && result.data ? result.data : [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, chargeId])

  const handleSubmit = async () => {
    setSaving(true)
    const result = await invoiceCharge({
      chargeId,
      target,
      serviceRecordId: target === 'existing' ? selected : null,
    })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error ?? t('agreement.invoiceFailed'))
      return
    }
    toast.success(t('agreement.invoiced', { number: result.data?.invoiceNumber ?? '' }))
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('agreement.invoiceTitle')}</DialogTitle>
          <DialogDescription>
            {t('agreement.invoiceDescription', {
              amount: `${amount.toFixed(2)} ${currency}`,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Option
            selected={target === 'new_invoice'}
            onSelect={() => {
              setTarget('new_invoice')
              setSelected(null)
            }}
            icon={<FilePlus2 className="h-4 w-4" />}
            title={t('agreement.newInvoice')}
            subtitle={t('agreement.newInvoiceHint')}
          />

          {/* Only offered with a vehicle: a work order is defined by the car
              it is for, and the board, the history and the technician's day
              all hang off that. */}
          {hasVehicle && (
            <Option
              selected={target === 'new_work_order'}
              onSelect={() => {
                setTarget('new_work_order')
                setSelected(null)
              }}
              icon={<ClipboardList className="h-4 w-4" />}
              title={t('agreement.newWorkOrder')}
              subtitle={t('agreement.newWorkOrderHint')}
            />
          )}

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              {t('agreement.noOpenInvoices')}
            </p>
          ) : (
            <>
              <p className="px-1 pt-2 text-xs font-medium text-muted-foreground">
                {t('agreement.addToOpen')}
              </p>
              {invoices.map((invoice) => (
                <Option
                  key={invoice.id}
                  selected={target === 'existing' && selected === invoice.id}
                  onSelect={() => {
                    setTarget('existing')
                    setSelected(invoice.id)
                  }}
                  icon={<FileText className="h-4 w-4" />}
                  title={invoice.invoiceNumber ?? invoice.title}
                  subtitle={[
                    invoice.vehicle?.licensePlate ??
                      (invoice.vehicle ? `${invoice.vehicle.make} ${invoice.vehicle.model}` : null),
                    formatDate(new Date(invoice.serviceDate)),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {invoice.totalAmount.toFixed(2)} {currency}
                    </span>
                  }
                />
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || loading || (target === 'existing' && !selected)}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {target === 'existing'
              ? t('agreement.addLine')
              : target === 'new_work_order'
                ? t('agreement.createWorkOrder')
                : t('agreement.createInvoice')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Option({
  selected,
  onSelect,
  icon,
  title,
  subtitle,
  trailing,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  subtitle?: string
  trailing?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        selected ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/60'
      )}
    >
      <span className={cn('shrink-0', selected ? 'text-primary' : 'text-muted-foreground')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        )}
      </span>
      {trailing}
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  )
}
