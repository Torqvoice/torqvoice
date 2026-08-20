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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { cn } from '@/lib/utils'
import { ArrowLeft, Check, ChevronsUpDown, ClipboardList, FilePlus2, Loader2 } from 'lucide-react'
import {
  addTireSetToWorkOrder,
  createQuoteFromTireSet,
  createWorkOrderFromTireSet,
  getOpenWorkOrdersForSet,
  getJobDraftForSet,
  searchTireStock,
} from '../Actions/tireJobActions'
import { useFormatDate } from '@/lib/use-format-date'

type Matches = NonNullable<Awaited<ReturnType<typeof getJobDraftForSet>>['data']>
type OpenJobs = NonNullable<Awaited<ReturnType<typeof getOpenWorkOrdersForSet>>['data']>
type SearchHits = NonNullable<Awaited<ReturnType<typeof searchTireStock>>['data']>
/// A row in the picker. Search hits carry whether they are the stored size;
/// the fitment matches are that size by definition.
type StockRow = SearchHits[number] | (Matches['matches'][number] & { fits?: boolean })

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
  // The whole part is kept, not just its id, so a pick made from a search
  // stays visible after the search is cleared.
  const [picked, setPicked] = useState<StockRow | null>(null)
  const [price, setPrice] = useState('')
  // Defaults to the set on the shelf, which is the usual job, but a customer
  // replacing two of four should not have to fix the line afterwards.
  const [qty, setQty] = useState('')
  const [query, setQuery] = useState('')
  // The picker floats over the dialog rather than growing inside it: a list
  // that opens in the layout pushes the prep, the total and the buttons down
  // the screen, and one that resizes per keystroke moves them again.
  const [browsing, setBrowsing] = useState(false)
  const [hits, setHits] = useState<SearchHits | null>(null)
  const [searching, setSearching] = useState(false)
  // Everything billable starts ticked, since that is the usual job. The point
  // of the list is that a swap on customer-supplied tires, or a wash given
  // as goodwill, can be dropped without editing the invoice afterwards.
  const [includeTires, setIncludeTires] = useState(true)
  const [includePrep, setIncludePrep] = useState<string[]>([])

  useEffect(() => {
    if (!open) {
      setData(null)
      setPicked(null)
      setPrice('')
      setQty('')
      setQuery('')
      setHits(null)
      setBrowsing(false)
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
      setQty(String(value?.quantity ?? 4))
      // Preselect the best match, which is the cheapest that covers the whole
      // set. Anything else and the operator is choosing from a list of one.
      const best = value?.matches[0]
      if (best) {
        setPicked(best)
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

  // Two characters is where a search stops meaning "most of the catalogue".
  const searchActive = query.trim().length >= 2

  useEffect(() => {
    if (!open || !searchActive) {
      setHits(null)
      return
    }
    let cancelled = false
    setSearching(true)
    // Typing a brand name should not fire a query per keystroke.
    const timer = setTimeout(async () => {
      const result = await searchTireStock({ tireSetId, query })
      if (cancelled) return
      setHits(result.success && result.data ? result.data : [])
      setSearching(false)
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, tireSetId, query, searchActive])

  // Every match in the size, not a top few: a shop can carry a dozen brands
  // in one fitment and the cheapest is not always the one being sold.
  const suggestions: StockRow[] = searchActive ? (hits ?? []) : (data?.matches ?? [])
  const pick = (row: StockRow) => {
    setPicked(row)
    setPrice(String(row.sellPrice))
    // Picking is the end of the search. Leaving the results open would hide
    // the prep list and the total behind a list nobody is reading any more.
    setQuery('')
    setHits(null)
    setBrowsing(false)
  }

  // Stock is judged against the quantity being sold, which the operator can
  // change, so it is worked out here rather than taken from the server.
  const stockMeta = (row: StockRow) => {
    const covered = row.quantity >= quantity
    return (
      <span className="block truncate text-[11px] text-muted-foreground">
        {row.partNumber ? `${row.partNumber} · ` : ''}
        <span className={cn(!covered && 'text-amber-600')}>
          {covered
            ? t('job.inStock', { count: row.quantity })
            : t('job.shortStock', { count: row.quantity })}
        </span>
        {/* Selling a size other than the one on the shelf is allowed, it just
            should not happen by accident. Said in the meta line rather than
            as a pill, so a long part name still has somewhere to go. */}
        {row.fits === false && <span className="text-amber-600"> · {t('job.otherSize')}</span>}
      </span>
    )
  }

  const toggleBrowsing = (next: boolean) => {
    setBrowsing(next)
    // A search left over from last time is not the next question being asked.
    if (!next) {
      setQuery('')
      setHits(null)
    }
  }

  const quantity = Math.max(1, Math.min(99, Math.round(Number(qty) || 0)))
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
      inventoryPartId: picked?.id ?? null,
      unitPrice: unit,
      quantity,
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
          <div className="min-w-0 space-y-2">
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
          <div className="min-w-0 space-y-3">
            <div className="min-w-0 space-y-1.5">
              <label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={includeTires}
                  onCheckedChange={(value) => setIncludeTires(value === true)}
                />
                <span className="text-sm font-medium">{t('job.tires')}</span>
              </label>

              {!includeTires ? (
                // The customer brought their own, or they are already on the
                // job. Say so, rather than leaving a blank where the picker was.
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  {t('job.tiresSkipped')}
                </p>
              ) : (
                // modal: the content portals out of the dialog, and a dialog's
                // scroll lock swallows wheel events over everything outside
                // itself, which would leave this list unscrollable.
                <Popover open={browsing} onOpenChange={toggleBrowsing} modal>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        {picked ? (
                          <>
                            <span className="block truncate text-sm">{picked.name}</span>
                            {stockMeta(picked)}
                          </>
                        ) : (
                          <>
                            {/* No stock item is a real answer, and the line
                                still gets made. It reads as the set itself,
                                which is exactly what the server will name it. */}
                            <span className="block truncate text-sm">
                              {data?.description ?? ''}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {t('job.noStockItem')}
                            </span>
                          </>
                        )}
                      </span>
                      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
                    <Command shouldFilter={false}>
                      <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder={t('job.searchStock')}
                      />
                      <CommandList className="max-h-56">
                        {searching && suggestions.length === 0 ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <CommandEmpty>
                            {/* Nothing matched, which is normal for an unusual
                                size or a shop that does not stock tires. */}
                            {searchActive
                              ? t('job.noSearchHits', { query: query.trim() })
                              : data?.parsedSize
                                ? t('job.noMatch', { size: data.parsedSize })
                                : t('job.noSize')}
                          </CommandEmpty>
                        )}
                        {suggestions.length > 0 && (
                          <CommandGroup
                            heading={
                              !searchActive && data?.parsedSize
                                ? t('job.inSize', {
                                    count: suggestions.length,
                                    size: data.parsedSize,
                                  })
                                : undefined
                            }
                          >
                            {suggestions.map((match) => {
                              const isOn = picked?.id === match.id
                              return (
                                <CommandItem
                                  key={match.id}
                                  value={match.id}
                                  onSelect={() => pick(match)}
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm">{match.name}</span>
                                    {stockMeta(match)}
                                  </span>
                                  <span className="shrink-0 text-sm tabular-nums">
                                    {formatCurrency(match.sellPrice, currencyCode)}
                                  </span>
                                  {/* The slot is always there, so highlighting
                                      a row does not shift the prices sideways. */}
                                  <span className="w-3.5 shrink-0">
                                    {/* size-, not h-/w-: CommandItem forces
                                        size-4 on any svg without one. */}
                                    {isOn && <Check className="size-3.5 text-primary" />}
                                  </span>
                                </CommandItem>
                              )
                            })}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}

              {includeTires && (
                <div className="flex min-w-0 flex-wrap items-center gap-2 pt-0.5">
                  <Label htmlFor="tireJobQty" className="shrink-0 text-xs font-normal">
                    {t('job.quantity')}
                  </Label>
                  <Input
                    id="tireJobQty"
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="h-8 w-14 text-sm tabular-nums"
                  />
                  <Label htmlFor="tireJobPrice" className="shrink-0 text-xs font-normal">
                    {t('job.unitPrice')}
                  </Label>
                  <Input
                    id="tireJobPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="h-8 w-24 text-sm tabular-nums"
                  />
                  <span className="min-w-0 flex-1 truncate text-right text-sm font-medium tabular-nums">
                    {formatCurrency(total, currencyCode)}
                  </span>
                </div>
              )}
            </div>

            {prep.length > 0 && (
              <div className="min-w-0 space-y-1.5">
                <p className="text-sm font-medium">{t('job.prep')}</p>
                <div className="divide-y rounded-lg border">
                  {prep.map((line) => (
                    <label
                      key={line.type}
                      className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 hover:bg-muted/50"
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

            <div className="flex items-center justify-between border-t pt-2.5">
              <span className="text-sm text-muted-foreground">{t('job.total')}</span>
              <span className="text-base font-semibold tabular-nums">
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
