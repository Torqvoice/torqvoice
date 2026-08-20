'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useConfirm } from '@/components/confirm-dialog'
import { OneOffChargeDialog } from './OneOffChargeDialog'
import { SettingsLink } from './SettingsLink'
import { DocsLink } from '@/components/docs-link'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { Ban, FileText, Loader2, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import { AgreementDialog, type EditableAgreement } from './AgreementDialog'
import { InvoiceChargeDialog } from './InvoiceChargeDialog'
import { deleteAgreement, endAgreement, waiveCharge } from '../Actions/agreementActions'
import {
  AGREEMENT_STATUS_TOKENS,
  CHARGE_STATUS_TOKENS,
  extrasTotal,
  parseExtras,
  type StorageAgreementStatus,
  type StorageChargeStatus,
} from '../Lib/billing'

type Charge = {
  id: string
  periodStart: Date
  periodEnd: Date
  amount: number
  status: string
  invoicedAt: Date | null
  serviceRecord: {
    id: string
    invoiceNumber: string | null
    status: string
    totalAmount: number
  } | null
}

/** A storage fee raised by hand: same row, no agreement behind it. */
export type OneOffCharge = Charge

export type AgreementRow = EditableAgreement & {
  status: string
  customer: { id: string; name: string } | null
  charges: Charge[]
}

/**
 * The money side of a stored set: the terms, and every period they have
 * produced.
 *
 * Periods are listed rather than summarised because "what has been billed" is
 * the question staff actually arrive with, usually while a customer is asking
 * why they got an invoice.
 */
export function AgreementCard({
  tireSetId,
  agreements,
  oneOffCharges,
  defaultSeasonalPrice,
  defaultMonthlyPrice,
  currency,
  hasVehicle,
  canEditSettings = false,
}: {
  tireSetId: string
  agreements: AgreementRow[]
  /** Fees raised by hand, listed beside the agreements rather than instead. */
  oneOffCharges: OneOffCharge[]
  defaultSeasonalPrice: number
  defaultMonthlyPrice: number
  currency: string
  hasVehicle: boolean
  canEditSettings?: boolean
}) {
  const t = useTranslations('tireHotel')
  const router = useRouter()
  const confirm = useConfirm()
  const { formatDate } = useFormatDate()
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<AgreementRow | undefined>()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [invoicing, setInvoicing] = useState<{ id: string; amount: number } | null>(null)
  const [charging, setCharging] = useState(false)

  const active = agreements.find((a) => a.status === 'active')

  /**
   * One period, whether an agreement raised it or somebody typed it in.
   * Shared rather than duplicated: a hand-raised fee that looked different
   * from a billed season would read as a different kind of thing, and it is
   * not, it invoices and waives through exactly the same path.
   */
  const chargeRow = (charge: Charge) => (
    <li
      key={charge.id}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border p-2 text-sm"
    >
      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
        {formatDate(new Date(charge.periodStart))} - {formatDate(new Date(charge.periodEnd))}
      </span>
      <span className="shrink-0 font-medium tabular-nums">
        {charge.amount.toFixed(2)} {currency}
      </span>
      <Badge
        variant="outline"
        className={cn(
          'shrink-0 text-[10px]',
          CHARGE_STATUS_TOKENS[charge.status as StorageChargeStatus]
        )}
      >
        {t(`agreement.chargeStatuses.${charge.status}`)}
      </Badge>

      {charge.serviceRecord ? (
        <Link
          href={`/sales/${charge.serviceRecord.id}`}
          className="shrink-0 text-xs text-primary hover:underline"
        >
          <FileText className="mr-1 inline h-3 w-3" />
          {charge.serviceRecord.invoiceNumber ?? t('agreement.openInvoice')}
        </Link>
      ) : charge.status === 'pending' ? (
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            className="h-7"
            onClick={() => setInvoicing({ id: charge.id, amount: charge.amount })}
            disabled={busyId === charge.id}
          >
            <Receipt className="mr-1 h-3 w-3" />
            {t('agreement.invoice')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => handleWaive(charge.id)}
            disabled={busyId === charge.id}
            aria-label={t('agreement.waive')}
            title={t('agreement.waive')}
          >
            <Ban className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </li>
  )

  const handleWaive = async (chargeId: string) => {
    const ok = await confirm({
      title: t('agreement.waiveTitle'),
      description: t('agreement.waiveBody'),
      confirmLabel: t('agreement.waive'),
    })
    if (!ok) return
    setBusyId(chargeId)
    const result = await waiveCharge(chargeId)
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error ?? t('agreement.waiveFailed'))
      return
    }
    toast.success(t('agreement.waived'))
    router.refresh()
  }

  const handleDelete = async (agreement: AgreementRow) => {
    const ok = await confirm({
      title: t('agreement.deleteTitle'),
      description: t('agreement.deleteBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    setBusyId(agreement.id)
    const result = await deleteAgreement(agreement.id)
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error ?? t('agreement.deleteFailed'))
      return
    }
    toast.success(t('agreement.deleted'))
    router.refresh()
  }

  const handleEnd = async (agreement: AgreementRow) => {
    const pending = agreement.charges.filter((c) => c.status === 'pending').length
    const ok = await confirm({
      title: t('agreement.endTitle'),
      description:
        pending > 0 ? t('agreement.endBodyPending', { count: pending }) : t('agreement.endBody'),
      confirmLabel: t('agreement.end'),
      destructive: true,
    })
    if (!ok) return
    setBusyId(agreement.id)
    const result = await endAgreement(agreement.id)
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error ?? t('agreement.endFailed'))
      return
    }
    toast.success(t('agreement.ended'))
    router.refresh()
  }

  return (
    <AppCard
      icon={Receipt}
      title={t('agreement.title')}
      action={
        <div className="flex gap-2">
          {/* Always offered, agreement or not: a shop that bills the season on
              the way in should not have to set up terms to do it. */}
          <Button size="sm" variant="outline" onClick={() => setCharging(true)}>
            <Receipt className="mr-1 h-3.5 w-3.5" />
            {t('agreement.charge')}
          </Button>
          {!active && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(undefined)
                setShowDialog(true)
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('agreement.add')}
            </Button>
          )}
        </div>
      }
      contentClassName="space-y-4"
      footer={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <SettingsLink can={canEditSettings} labelKey="settings.storagePrices" />
          <DocsLink href="/docs/features/tire-hotel" variant="hint" />
        </div>
      }
    >
      {agreements.length === 0 && oneOffCharges.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('agreement.none')}</p>
      ) : (
        agreements.map((agreement) => {
          const extras = parseExtras(agreement.extras)
          const perPeriod = agreement.price + extrasTotal(extras)
          return (
            <div key={agreement.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold tabular-nums">
                      {perPeriod.toFixed(2)} {currency}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t(`agreement.perPeriod.${agreement.billingModel}`)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        AGREEMENT_STATUS_TOKENS[agreement.status as StorageAgreementStatus]
                      )}
                    >
                      {t(`agreement.statuses.${agreement.status}`)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(new Date(agreement.startDate))}
                    {agreement.endDate
                      ? ` - ${formatDate(new Date(agreement.endDate))}`
                      : ` · ${t(agreement.autoRenew ? 'agreement.renews' : 'agreement.noRenew')}`}
                  </p>
                  {extras.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {extras.map((e) => `${e.label} ${e.price.toFixed(2)}`).join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex gap-1">
                  {agreement.status === 'active' && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => {
                          setEditing(agreement)
                          setShowDialog(true)
                        }}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        {t('common.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => handleEnd(agreement)}
                        disabled={busyId === agreement.id}
                      >
                        {busyId === agreement.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          t('agreement.end')
                        )}
                      </Button>
                    </>
                  )}
                  {/* Nothing billed means nothing to preserve: a trial or a
                      mistake should not sit on the record forever. Once a
                      period reaches an invoice the agreement is the reason
                      that line exists, so only End remains. */}
                  {!agreement.charges.some((c) => c.status === 'invoiced') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(agreement)}
                      disabled={busyId === agreement.id}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {agreement.charges.length > 0 && (
                <>
                  <Separator />
                  <ul className="space-y-1.5">
                    {agreement.charges.map((charge) => chargeRow(charge))}
                  </ul>
                </>
              )}
            </div>
          )
        })
      )}

      {oneOffCharges.length > 0 && (
        <div className="space-y-1.5">
          {agreements.length > 0 && <Separator />}
          <p className="text-xs font-medium text-muted-foreground">{t('agreement.oneOff')}</p>
          <ul className="space-y-1.5">{oneOffCharges.map((charge) => chargeRow(charge))}</ul>
        </div>
      )}

      {charging && (
        <OneOffChargeDialog
          open={charging}
          onOpenChange={setCharging}
          tireSetId={tireSetId}
          defaultPrice={defaultSeasonalPrice}
          currency={currency}
        />
      )}

      {invoicing && (
        <InvoiceChargeDialog
          open
          onOpenChange={(open) => !open && setInvoicing(null)}
          chargeId={invoicing.id}
          amount={invoicing.amount}
          currency={currency}
          hasVehicle={hasVehicle}
        />
      )}

      <AgreementDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open)
          if (!open) setEditing(undefined)
        }}
        tireSetId={tireSetId}
        agreement={editing}
        defaultSeasonalPrice={defaultSeasonalPrice}
        defaultMonthlyPrice={defaultMonthlyPrice}
        currency={currency}
      />
    </AppCard>
  )
}
