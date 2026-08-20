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
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { cn } from '@/lib/utils'
import { ArrowLeft, Check, ClipboardList, FilePlus2, Loader2, PackageX } from 'lucide-react'
import {
  addTireSetToWorkOrder,
  createQuoteFromTireSet,
  createWorkOrderFromTireSet,
  getOpenWorkOrdersForSet,
  getJobDraftForSet,
} from '../Actions/tireJobActions'
import { useFormatDate } from '@/lib/use-format-date'

type Matches = NonNullable<Awaited<ReturnType<typeof getJobDraftForSet>>['data']>
type OpenJobs = NonNullable<Awaited<ReturnType<typeof getOpenWorkOrdersForSet>>['data']>

/**
 * Turning a stored set into work.
 *
 * Two ways out, because both happen: a customer who asked what it would cost
 * needs a quote, and a customer who has already said yes needs the job on the
 * board without a quote in between. Neither is the exception.
 *
 * Tires are picked from stock rather than typed, since the set already knows
 * its size and the shop already knows what it has in that size. The price
 * stays editable because tire prices move faster than a stock record does.
 */
export function NewTireJobDialog({
  open,
  onOpenChange,
  tireSetId,
  mode,
  hasVehicle,
  currencyCode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tireSetId: string
  mode: 'quote' | 'workOrder'
  hasVehicle: boolean
  currencyCode: string
}) {
  const t = useTranslations('tireHotel')
  const router = useRouter()
  const formatCurrency = useFormatCurrency()
  const { formatDate } = useFormatDate()
  // Work orders ask where the lines go before asking what they are; a quote
  // has nowhere else to go, so it skips straight to the tires.
  const [step, setStep] = useState<'target' | 'lines'>(mode === 'quote' ? 'lines' : 'target')
  const [openJobs, setOpenJobs] = useState<OpenJobs>([])
  const [target, setTarget] = useState<string | null>(null)
  const [data, setData] = useState<Matches | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  // Everything billable starts ticked, since that is the usual job. The point
  // of the list is that a swap on customer-supplied tires, or a wash given
  // as goodwill, can be dropped without editing the invoice afterwards.
  const [includeTires, setIncludeTires] = useState(true)
  const [includePrep, setIncludePrep] = useState<string[]>([])

  useEffect(() => {
    if (!open) {
      setData(null)
      setSelected(null)
      setPrice('')
      setOpenJobs([])
      setTarget(null)
      setIncludeTires(true)
      setIncludePrep([])
      setStep(mode === 'quote' ? 'lines' : 'target')
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([
      getJobDraftForSet(tireSetId),
      mode === 'workOrder' ? getOpenWorkOrdersForSet(tireSetId) : Promise.resolve(null),
    ]).then(([stock, jobs]) => {
      if (cancelled) return
      const value = stock.success && stock.data ? stock.data : null
      setData(value)
      // Preselect the best match, which is the cheapest that covers the whole
      // set. Anything else and the operator is choosing from a list of one.
      const best = value?.matches[0]
      if (best) {
        setSelected(best.id)
        setPrice(String(best.sellPrice))
      }
      setIncludePrep((value?.prep ?? []).map((line) => line.type))

      const rows = jobs?.success && jobs.data ? jobs.data : []
      setOpenJobs(rows)
      // Nothing to choose between, so the question is not worth asking.
      if (mode === 'workOrder' && rows.length === 0) setStep('lines')
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, tireSetId, mode])

  const quantity = data?.quantity ?? 0
  const unit = Number(price) || 0
  const total = Math.round(unit * quantity * 100) / 100

  const prep = data?.prep ?? []
  const prepTotal = prep
    .filter((line) => includePrep.includes(line.type))
    .reduce((sum, line) => sum + line.price, 0)
  const jobTotal = Math.round(((includeTires ? total : 0) + prepTotal) * 100) / 100
  // A job with nothing on it is not worth raising, and an empty quote reads
  // as a bug rather than as a choice.
  const nothingPicked = !includeTires && includePrep.length === 0

  const togglePrep = (type: string) =>
    setIncludePrep((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    )

  const handleSubmit = async () => {
    setSaving(true)
    const payload = {
      tireSetId,
      inventoryPartId: selected,
      unitPrice: unit,
      includeTires,
      includeTreatments: includePrep,
    }
    const result =
      mode === 'quote'
        ? await createQuoteFromTireSet(payload)
        : target
          ? await addTireSetToWorkOrder({ ...payload, serviceRecordId: target })
          : await createWorkOrderFromTireSet(payload)
    setSaving(false)

    if (!result.success) {
      toast.error(result.error ?? t('job.failed'))
      return
    }
    onOpenChange(false)

    if (mode === 'quote' && result.data && 'quoteNumber' in result.data) {
      toast.success(t('job.quoteCreated', { number: result.data.quoteNumber ?? '' }))
      router.push(`/quotes/${result.data.id}`)
      return
    }
    if (result.data && 'vehicleId' in result.data) {
      toast.success(target ? t('job.workOrderUpdated') : t('job.workOrderCreated'))
      router.push(`/vehicles/${result.data.vehicleId}/service/${result.data.id}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(mode === 'quote' ? 'job.quoteTitle' : 'job.workOrderTitle')}</DialogTitle>
          <DialogDescription>{data?.description ?? t('job.loadingSet')}</DialogDescription>
        </DialogHeader>

        {mode === 'workOrder' && !hasVehicle ? (
          <p className="py-4 text-sm text-muted-foreground">{t('job.needsVehicle')}</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : step === 'target' ? (
          <div className="space-y-2">
            <TargetOption
              selected={target === null}
              onSelect={() => setTarget(null)}
              icon={<FilePlus2 className="h-4 w-4" />}
              title={t('job.targetNew')}
              subtitle={t('job.targetNewHint')}
            />
            <p className="px-1 pt-2 text-xs font-medium text-muted-foreground">
              {t('job.targetExisting')}
            </p>
            {openJobs.map((job) => (
              <TargetOption
                key={job.id}
                selected={target === job.id}
                onSelect={() => setTarget(job.id)}
                icon={<ClipboardList className="h-4 w-4" />}
                title={job.invoiceNumber ?? job.title}
                subtitle={`${job.title} · ${formatDate(new Date(job.serviceDate))}`}
                trailing={
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(job.totalAmount, currencyCode)}
                  </span>
                }
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={includeTires}
                  onCheckedChange={(value) => setIncludeTires(value === true)}
                />
                <span className="text-sm font-medium">{t('job.tires')}</span>
                <span className="text-xs text-muted-foreground">
                  {t('job.quantityNote', { count: quantity })}
                </span>
              </label>

              {!includeTires ? (
                // The customer brought their own, or they are already on the
                // job. Say so, rather than leaving a blank where the picker was.
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  {t('job.tiresSkipped')}
                </p>
              ) : data && data.matches.length > 0 ? (
                <div className="space-y-2">
                  {data.matches.slice(0, 6).map((match) => {
                    const isOn = selected === match.id
                    return (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => {
                          setSelected(match.id)
                          setPrice(String(match.sellPrice))
                        }}
                        aria-pressed={isOn}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                          isOn ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/60'
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{match.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {match.partNumber ? `${match.partNumber} · ` : ''}
                            {match.inStock
                              ? t('job.inStock', { count: match.quantity })
                              : t('job.shortStock', { count: match.quantity })}
                          </span>
                        </span>
                        {!match.inStock && (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-600"
                          >
                            {t('job.order')}
                          </Badge>
                        )}
                        <span className="shrink-0 text-sm tabular-nums">
                          {formatCurrency(match.sellPrice, currencyCode)}
                        </span>
                        {isOn && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              ) : (
                // Nothing matched, which is normal for an unusual size or a
                // shop that does not stock tires. The line still gets made,
                // priced by hand.
                <div className="flex items-start gap-2.5 rounded-lg border border-dashed p-3">
                  <PackageX className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {data?.parsedSize
                      ? t('job.noMatch', { size: data.parsedSize })
                      : t('job.noSize')}
                  </p>
                </div>
              )}

              {includeTires && (
                <div className="flex items-end gap-3 pt-1">
                  <div className="w-40 space-y-1.5">
                    <Label htmlFor="tireJobPrice" className="text-xs">
                      {t('job.unitPrice')}
                    </Label>
                    <Input
                      id="tireJobPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="tabular-nums"
                    />
                  </div>
                  <p className="flex h-9 flex-1 items-center justify-end text-sm font-medium tabular-nums">
                    {formatCurrency(total, currencyCode)}
                  </p>
                </div>
              )}
            </div>

            {prep.length > 0 && (
              <div className="space-y-2">
                <Label>{t('job.prep')}</Label>
                <div className="rounded-lg border">
                  {prep.map((line) => (
                    <label
                      key={line.type}
                      className="flex cursor-pointer items-center gap-2.5 border-b p-3 last:border-b-0 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={includePrep.includes(line.type)}
                        onCheckedChange={() => togglePrep(line.type)}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {t(`treatments.types.${line.type}`)}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatCurrency(line.price, currencyCode)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">{t('job.total')}</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatCurrency(jobTotal, currencyCode)}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'lines' && mode === 'workOrder' && openJobs.length > 0 ? (
            <Button variant="ghost" onClick={() => setStep('target')} disabled={saving}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t('common.back')}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
          )}

          {step === 'target' ? (
            <Button onClick={() => setStep('lines')} disabled={loading}>
              {t('common.next')}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={saving || loading || nothingPicked || (mode === 'workOrder' && !hasVehicle)}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'quote'
                ? t('job.createQuote')
                : target
                  ? t('job.addToWorkOrder')
                  : t('job.createWorkOrder')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TargetOption({
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
