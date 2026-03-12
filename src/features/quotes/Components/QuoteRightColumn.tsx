'use client'

import { memo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowRight,
  Car,
  Check,
  ClipboardCheck,
  Loader2,
  MessageSquare,
  Users,
  X,
} from 'lucide-react'
import { SharedLinkCard } from '@/components/shared-link-card'
import { formatCurrency } from '@/lib/format'
import type { QuoteFormState } from './useQuoteFormState'
import type { QuoteRecord } from './quote-page-types'
import { VehicleCombobox } from './VehicleCombobox'
import { CustomerCombobox } from './CustomerCombobox'

interface QuoteRightColumnProps {
  state: QuoteFormState
  quote: QuoteRecord
  organizationId: string
  currencyCode: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: any) => string
  onRevoke: () => Promise<void>
}

export const QuoteRightColumn = memo(function QuoteRightColumn({
  state,
  quote,
  organizationId,
  currencyCode,
  t,
  onRevoke,
}: QuoteRightColumnProps) {
  return (
    <div className="space-y-3">
      {/* Convert to Work Order */}
      {quote.status !== 'converted' && (
        <div className="rounded-lg border p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => state.setShowConvertDialog(true)}
          >
            <ArrowRight className="mr-1 h-3.5 w-3.5" /> {t('page.convertToWorkOrder')}
          </Button>
        </div>
      )}

      {/* Shared Link */}
      {quote.publicToken && (
        <SharedLinkCard
          publicToken={quote.publicToken}
          organizationId={organizationId}
          type="quote"
          sharedAt={quote.sharedAt}
          viewCount={quote.viewCount}
          lastViewedAt={quote.lastViewedAt}
          onRevoke={onRevoke}
        />
      )}

      {/* Vehicle & Customer */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">{t('details.vehicle')}</Label>
          <VehicleCombobox
            value={state.vehicleId}
            initialVehicle={state.selectedVehicle}
            placeholder={t('details.selectVehicle')}
            noneLabel={t('details.none')}
            onChange={(id, vehicle) => {
              state.setVehicleId(id)
              state.setSelectedVehicle(vehicle)
              if (vehicle?.customerId) {
                state.setCustomerId(vehicle.customerId)
                if (vehicle.customer) {
                  state.setSelectedCustomer({
                    id: vehicle.customer.id,
                    name: vehicle.customer.name,
                    company: null,
                  })
                }
              }
              state.markDirty()
            }}
          />
        </div>
        {state.selectedVehicle && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
            <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Link
              href={`/vehicles/${state.selectedVehicle.id}`}
              target="_blank"
              className="min-w-0 flex-1 text-sm hover:underline"
            >
              <span className="font-medium">
                {state.selectedVehicle.year} {state.selectedVehicle.make}{' '}
                {state.selectedVehicle.model}
              </span>
              {state.selectedVehicle.licensePlate && (
                <span className="ml-1.5 text-muted-foreground">
                  {state.selectedVehicle.licensePlate}
                </span>
              )}
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                state.setVehicleId('')
                state.setSelectedVehicle(null)
                state.markDirty()
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">{t('details.customer')}</Label>
          <CustomerCombobox
            value={state.customerId}
            initialCustomer={state.selectedCustomer}
            placeholder={t('details.selectCustomer')}
            noneLabel={t('details.none')}
            onChange={(id, customer) => {
              state.setCustomerId(id)
              state.setSelectedCustomer(customer)
              state.markDirty()
            }}
          />
        </div>
        {state.selectedCustomer && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Link
              href={`/customers/${state.selectedCustomer.id}`}
              target="_blank"
              className="min-w-0 flex-1 text-sm hover:underline"
            >
              <span className="font-medium">{state.selectedCustomer.name}</span>
              {state.selectedCustomer.company && (
                <span className="ml-1.5 text-muted-foreground">
                  {state.selectedCustomer.company}
                </span>
              )}
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                state.setCustomerId('')
                state.setSelectedCustomer(null)
                state.markDirty()
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Quote Details */}
      <div className="rounded-lg border p-3 space-y-3">
        <h3 className="text-sm font-semibold">{t('details.title')}</h3>
        <div className="space-y-1">
          <Label htmlFor="title" className="text-xs">
            {t('details.titleLabel')}
          </Label>
          <Input
            id="title"
            name="title"
            placeholder={t('details.titlePlaceholder')}
            defaultValue={quote.title}
            required
            onChange={state.markDirty}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('details.status')}</Label>
            <Select
              value={state.status}
              onValueChange={(v) => {
                state.setStatus(v)
                state.markDirty()
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t('details.statusDraft')}</SelectItem>
                <SelectItem value="sent">{t('details.statusSent')}</SelectItem>
                <SelectItem value="accepted">{t('details.statusAccepted')}</SelectItem>
                <SelectItem value="rejected">{t('details.statusRejected')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="validUntil" className="text-xs">
              {t('details.validUntil')}
            </Label>
            <Input
              id="validUntil"
              name="validUntil"
              type="date"
              defaultValue={state.defaultValidDate}
              onChange={state.markDirty}
            />
          </div>
        </div>
        {quote.inspectionId && (
          <Link
            href={`/inspections/${quote.inspectionId}`}
            className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
            <span>{t('details.viewInspection')}</span>
          </Link>
        )}
      </div>

      {/* Customer Response */}
      {quote.customerMessage &&
        (state.status === 'changes_requested' || state.status === 'accepted') && (
          <div
            className={`rounded-lg border p-3 space-y-2 ${
              state.status === 'changes_requested'
                ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20'
                : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3
                className={`flex items-center gap-1.5 text-sm font-semibold ${
                  state.status === 'changes_requested'
                    ? 'text-orange-700 dark:text-orange-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {state.status === 'changes_requested'
                  ? t('page.changesRequested')
                  : t('page.quoteAccepted')}
              </h3>
              <span
                className={`text-[10px] ${
                  state.status === 'changes_requested'
                    ? 'text-orange-500 dark:text-orange-500'
                    : 'text-emerald-500 dark:text-emerald-500'
                }`}
              >
                {new Date(quote.updatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}{' '}
                {new Date(quote.updatedAt).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p
              className={`text-sm ${
                state.status === 'changes_requested'
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              &ldquo;{quote.customerMessage}&rdquo;
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={state.resolving}
              onClick={state.handleResolveResponse}
            >
              {state.resolving ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1 h-3.5 w-3.5" />
              )}
              {t('page.markResolved')}
            </Button>
          </div>
        )}

      {/* Totals */}
      <div className="rounded-lg border p-3 space-y-2">
        <h3 className="text-sm font-semibold">{t('totals.title')}</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('totals.parts')}</span>
            <span>{formatCurrency(state.partsSubtotal, currencyCode)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('totals.labor')}</span>
            <span>{formatCurrency(state.laborSubtotal, currencyCode)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('totals.subtotal')}</span>
            <span className="font-medium">{formatCurrency(state.subtotal, currencyCode)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('totals.discount')}</span>
              <Select
                value={state.discountType}
                onValueChange={(v) => {
                  state.setDiscountType(v)
                  state.markDirty()
                }}
              >
                <SelectTrigger className="h-7 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('totals.discountNone')}</SelectItem>
                  <SelectItem value="percentage">{t('totals.discountPercentage')}</SelectItem>
                  <SelectItem value="fixed">{t('totals.discountFixed')}</SelectItem>
                </SelectContent>
              </Select>
              {state.discountType !== 'none' && (
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.discountValue}
                  onChange={(e) => {
                    state.setDiscountValue(e.target.value === '' ? 0 : Number(e.target.value))
                    state.markDirty()
                  }}
                  className="h-7 w-20 text-right text-xs"
                />
              )}
              {state.discountType === 'percentage' && (
                <span className="text-muted-foreground">%</span>
              )}
            </div>
            {state.discountAmount > 0 && (
              <span className="text-destructive">
                {formatCurrency(-state.discountAmount, currencyCode)}
              </span>
            )}
          </div>
          {state.taxEnabled && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t('totals.tax')}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={state.taxRate}
                  onChange={(e) => {
                    state.setTaxRate(e.target.value === '' ? 0 : Number(e.target.value))
                    state.markDirty()
                  }}
                  className="h-7 w-20 text-right text-xs"
                />
                <span className="text-muted-foreground">%</span>
              </div>
              <span>{formatCurrency(state.taxAmount, currencyCode)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-2 text-lg font-bold">
            <span>{t('totals.total')}</span>
            <span>{formatCurrency(state.totalAmount, currencyCode)}</span>
          </div>
        </div>
      </div>
    </div>
  )
})
