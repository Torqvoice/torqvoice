'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import {
  ArrowRight,
  Building2,
  Car,
  Check,
  Copy,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  User,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PLATE_LOOKUP_EVENT, usePlateLookupAccess } from '@/components/plate-lookup-context'
import { getCustomersList } from '@/features/customers/Actions/customerActions'
import type { VehicleLookup } from '@/features/integrations/Actions/vehicleLookupActions'
import { cn } from '@/lib/utils'
import { type PlateLookup, lookupPlate } from '../Actions/plateLookupActions'
import { compactPlate, looksLikePlate } from '../Lib/plate'
import { VehicleForm } from './VehicleForm'

/**
 * The header's plate lookup: one field, one answer sheet.
 *
 * Type a plate, press Enter, and the sheet fills with what the workshop knows
 * (the vehicle, its owner, its history) beside what the registry publishes
 * (identity, engine, dates, tyres). A vehicle the workshop has not seen gets
 * an "Add vehicle" that opens the ordinary form with the registry's answer
 * already typed in.
 *
 * Opened from the header button, from Ctrl+Shift+L, or by any code that
 * dispatches the plate-lookup event, optionally with a plate to search.
 */

const RECENT_KEY = 'torqvoice.plate-lookup.recent'
const RECENT_MAX = 6

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

function writeRecent(plates: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(plates))
  } catch {
    // Private windows and blocked storage: the list is a convenience.
  }
}

/** Days until a date, negative when past. */
function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

type Phase = 'idle' | 'loading' | 'done'

export function PlateLookupCommand() {
  const t = useTranslations('vehicles.plateLookup')
  const tf = useTranslations('vehicles.form')
  const format = useFormatter()
  const router = useRouter()
  const { available, canCreate, registryName } = usePlateLookupAccess()

  const [open, setOpen] = useState(false)
  const [plate, setPlate] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<PlateLookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formLookup, setFormLookup] = useState<VehicleLookup | null>(null)
  const [customers, setCustomers] = useState<
    { id: string; name: string; company: string | null }[]
  >([])
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)

  const run = useCallback(
    async (typed: string) => {
      const value = typed.trim()
      if (!looksLikePlate(value)) {
        setError(t('invalid'))
        return
      }
      const id = ++requestRef.current
      setPhase('loading')
      setError(null)
      setResult(null)
      setCopied(false)
      const res = await lookupPlate({ plate: value })
      if (id !== requestRef.current) return
      if (!res.success || !res.data) {
        setPhase('idle')
        setError(res.error || t('registryFailedGeneric'))
        return
      }
      setResult(res.data)
      setPhase('done')
      const compact = res.data.plate
      setRecent((prev) => {
        const next = [compact, ...prev.filter((p) => p !== compact)].slice(0, RECENT_MAX)
        writeRecent(next)
        return next
      })
    },
    [t]
  )

  // Open on the header button, the shortcut, or a request carrying a plate.
  useEffect(() => {
    if (!available) return
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ plate?: string }>).detail
      setOpen(true)
      if (detail?.plate) {
        setPlate(compactPlate(detail.plate))
        void run(detail.plate)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener(PLATE_LOOKUP_EVENT, onEvent)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener(PLATE_LOOKUP_EVENT, onEvent)
      document.removeEventListener('keydown', onKey)
    }
  }, [available, run])

  useEffect(() => {
    if (!open) return
    setRecent(readRecent())
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  const reset = () => {
    setPlate('')
    setPhase('idle')
    setResult(null)
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const openVehicle = (id: string) => {
    handleOpenChange(false)
    router.push(`/vehicles/${id}`)
  }

  const addVehicle = async () => {
    if (!result) return
    const registry = result.registry
    setFormLookup(
      registry
        ? { ...registry, licensePlate: registry.licensePlate ?? result.plate }
        : { licensePlate: result.plate, source: '' }
    )
    const list = await getCustomersList()
    setCustomers(list.success && list.data ? list.data : [])
    setOpen(false)
    setFormOpen(true)
  }

  const copyVin = async (vin: string) => {
    try {
      await navigator.clipboard.writeText(vin)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the VIN is still on screen to select.
    }
  }

  const fuelLabel = (fuel: string) => {
    const known = ['gasoline', 'diesel', 'electric', 'hybrid', 'other']
    return known.includes(fuel) ? tf(fuel) : fuel
  }
  const gearboxLabel = (gearbox: string) => {
    const known = ['automatic', 'manual', 'cvt']
    return known.includes(gearbox) ? tf(gearbox) : gearbox
  }
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' })

  const registry = result?.registry ?? null
  const vehicle = result?.vehicle ?? null
  /** The headline: the workshop's own record if there is one, else the registry's. */
  const headline = useMemo(() => {
    if (vehicle) return { make: vehicle.make, model: vehicle.model, year: vehicle.year }
    if (registry?.make || registry?.model)
      return { make: registry.make ?? '', model: registry.model ?? '', year: registry.year }
    return null
  }, [vehicle, registry])

  const details = useMemo(() => {
    if (!registry) return []
    const rows: { key: string; label: string; value: string; tone?: 'overdue' | 'soon' }[] = []
    const push = (key: string, label: string, value?: string | null, tone?: 'overdue' | 'soon') => {
      if (value) rows.push({ key, label, value, tone })
    }
    push('fuel', t('fuel'), registry.fuelType ? fuelLabel(registry.fuelType) : undefined)
    push(
      'transmission',
      t('transmission'),
      registry.transmission ? gearboxLabel(registry.transmission) : undefined
    )
    push('engine', t('engine'), registry.engineSize)
    push('engineCode', t('engineCode'), registry.engineCode)
    push('color', t('color'), registry.color)
    push('class', t('vehicleClass'), registry.vehicleClass)
    push(
      'firstRegistered',
      t('firstRegistered'),
      registry.firstRegistered ? date(registry.firstRegistered) : undefined
    )
    if (registry.inspectionDue) {
      const days = daysUntil(registry.inspectionDue)
      push(
        'inspectionDue',
        t('inspectionDue'),
        date(registry.inspectionDue),
        days < 0 ? 'overdue' : days <= 60 ? 'soon' : undefined
      )
    }
    push(
      'lastInspected',
      t('lastInspected'),
      registry.lastInspected ? date(registry.lastInspected) : undefined
    )
    if (registry.weights?.kerb && registry.weights.grossMax) {
      push(
        'weights',
        t('weights'),
        t('weightsValue', { kerb: registry.weights.kerb, gross: registry.weights.grossMax })
      )
    } else if (registry.weights?.kerb) {
      push('weights', t('weights'), t('kerbOnly', { kerb: registry.weights.kerb }))
    } else if (registry.weights?.grossMax) {
      push('weights', t('weights'), t('grossOnly', { gross: registry.weights.grossMax }))
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, t, tf, format])

  if (!available) return null

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="gap-0 overflow-hidden p-0 sm:max-w-2xl"
          showCloseButton={false}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>

          {/* The plate field, drawn as a plate: a band at the left, the
              characters in a fixed-width face, spaced the way a plate is. */}
          <form
            className="flex items-stretch gap-2 border-b bg-muted/30 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void run(plate)
            }}
          >
            <div className="flex flex-1 items-stretch overflow-hidden rounded-lg border-2 border-foreground/25 bg-background shadow-sm transition-colors focus-within:border-primary">
              <div className="flex w-7 shrink-0 items-end justify-center bg-primary/85 pb-1.5">
                <Car className="h-3.5 w-3.5 text-primary-foreground" aria-hidden />
              </div>
              <input
                ref={inputRef}
                value={plate}
                onChange={(e) => {
                  setPlate(e.target.value.toUpperCase())
                  if (error) setError(null)
                }}
                placeholder={t('placeholder')}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={16}
                aria-label={t('placeholder')}
                className="h-14 min-w-0 flex-1 bg-transparent px-4 font-mono text-2xl font-semibold uppercase tracking-[0.18em] text-foreground outline-none placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground/70"
              />
              {plate && (
                <button
                  type="button"
                  onClick={() => {
                    reset()
                    inputRef.current?.focus()
                  }}
                  className="px-3 text-muted-foreground hover:text-foreground"
                  aria-label={t('clearRecent')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button type="submit" className="h-auto px-4" disabled={phase === 'loading'}>
              {phase === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{t('search')}</span>
            </Button>
          </form>

          <div className="min-h-[320px]">
            {error && (
              <p className="border-b bg-destructive/5 px-4 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {phase === 'idle' && !result && (
              <div className="flex flex-col gap-6 px-5 py-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <Search className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">{t('emptyTitle')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('emptyBody', { source: registryName ?? t('registryWord') })}
                    </p>
                  </div>
                </div>
                {recent.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide">{t('recent')}</span>
                      <button
                        type="button"
                        className="hover:text-foreground"
                        onClick={() => {
                          setRecent([])
                          writeRecent([])
                        }}
                      >
                        {t('clearRecent')}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recent.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            setPlate(p)
                            void run(p)
                          }}
                          className="rounded-md border bg-background px-2.5 py-1 font-mono text-sm tracking-wider transition-colors hover:border-primary hover:text-primary"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {phase === 'loading' && (
              <div className="space-y-4 px-5 py-6" aria-busy>
                <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                </div>
                <p className="pt-2 text-xs text-muted-foreground">
                  {registryName ? t('looking', { source: registryName }) : t('lookingWorkshop')}
                </p>
              </div>
            )}

            {phase === 'done' && result && (
              <div className="divide-y">
                {/* Headline: what the car is, and which register said so. */}
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    {headline ? (
                      <p className="truncate text-xl font-semibold leading-tight">
                        {headline.year ? `${headline.year} ` : ''}
                        {headline.make} {headline.model}
                      </p>
                    ) : (
                      <p className="text-xl font-semibold leading-tight text-muted-foreground">
                        {result.source
                          ? t('registryNotFound', { source: result.source })
                          : t('registryFailedGeneric')}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded border px-1.5 py-0.5 font-mono text-[11px] tracking-wider text-foreground">
                        {vehicle?.licensePlate ?? registry?.licensePlate ?? result.plate}
                      </span>
                      {registry && <span>{t('fromSource', { source: registry.source })}</span>}
                      {registry?.registered === true && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="h-3.5 w-3.5" /> {t('registered')}
                        </span>
                      )}
                      {registry?.registered === false && (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <ShieldOff className="h-3.5 w-3.5" /> {t('notRegistered')}
                        </span>
                      )}
                    </div>
                    {result.registryError && (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        {result.source
                          ? `${t('registryFailed', { source: result.source })}: ${result.registryError}`
                          : result.registryError}
                      </p>
                    )}
                    {!result.registryError && !registry && result.source && headline && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('registryNotFound', { source: result.source })}
                      </p>
                    )}
                  </div>
                  {registry?.vin && (
                    <button
                      type="button"
                      onClick={() => copyVin(registry.vin as string)}
                      className="group flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
                      title={t('copyVin')}
                    >
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t('vin')}
                        </div>
                        <div className="font-mono text-sm">{registry.vin}</div>
                      </div>
                      {copied ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                      )}
                    </button>
                  )}
                </div>

                {/* The workshop's half: the car is yours, or it could be. */}
                {vehicle ? (
                  <div className="flex flex-wrap items-center gap-4 px-5 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
                      {vehicle.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={vehicle.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Car className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {vehicle.isArchived ? t('inWorkshopArchived') : t('inWorkshop')}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {vehicle.customer ? (
                          <span className="inline-flex items-center gap-1">
                            {vehicle.customer.company ? (
                              <Building2 className="h-3 w-3" />
                            ) : (
                              <User className="h-3 w-3" />
                            )}
                            {vehicle.customer.name}
                            {vehicle.customer.company ? ` (${vehicle.customer.company})` : ''}
                          </span>
                        ) : (
                          <span>{t('noOwner')}</span>
                        )}
                        {vehicle.mileage > 0 && (
                          <span>· {t('mileage', { km: format.number(vehicle.mileage) })}</span>
                        )}
                        <span>· {t('services', { count: vehicle.serviceCount })}</span>
                        {vehicle.lastServiceAt && (
                          <span>· {t('lastService', { date: date(vehicle.lastServiceAt) })}</span>
                        )}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => openVehicle(vehicle.id)}>
                      {t('openVehicle')}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  (registry || canCreate) && (
                    <div className="flex flex-wrap items-center gap-4 px-5 py-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                        <Plus className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{t('notInWorkshop')}</p>
                        <p className="text-xs text-muted-foreground">
                          {registry ? t('notInWorkshopHint') : t('notInWorkshopNoRegistry')}
                        </p>
                      </div>
                      {canCreate && (
                        <Button
                          size="sm"
                          variant={registry ? 'default' : 'outline'}
                          onClick={addVehicle}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          {t('addVehicle')}
                        </Button>
                      )}
                    </div>
                  )
                )}

                {/* The registry's half: everything it publishes, as a sheet. */}
                {details.length > 0 && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-3">
                    {details.map((row) => (
                      <div key={row.key} className="min-w-0">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {row.label}
                        </dt>
                        <dd
                          className={cn(
                            'truncate text-sm',
                            row.tone === 'overdue' && 'font-medium text-destructive',
                            row.tone === 'soon' && 'font-medium text-amber-600 dark:text-amber-400'
                          )}
                          title={row.value}
                        >
                          {row.value}
                          {row.tone === 'overdue' && (
                            <span className="ml-1.5 text-[10px] uppercase">{t('overdue')}</span>
                          )}
                          {row.tone === 'soon' && (
                            <span className="ml-1.5 text-[10px] uppercase">{t('dueSoon')}</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {registry?.tyres && registry.tyres.length > 0 && (
                  <div className="px-5 py-4">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('tyres')}
                    </p>
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="pb-1 font-medium" />
                          <th className="pb-1 font-medium">{t('tyreSize')}</th>
                          <th className="pb-1 font-medium">{t('rimSize')}</th>
                          <th className="pb-1 font-medium">{t('loadSpeed')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registry.tyres.map((axle) => (
                          <tr key={axle.axle} className="border-t">
                            <td className="py-1.5 text-muted-foreground">
                              {t('axle', { n: axle.axle })}
                            </td>
                            <td className="py-1.5 font-mono">{axle.tyre ?? '–'}</td>
                            <td className="py-1.5 font-mono">{axle.rim ?? '–'}</td>
                            <td className="py-1.5 font-mono">
                              {[axle.loadIndex, axle.speedRating].filter(Boolean).join(' ') || '–'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              <kbd className="pointer-events-none inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                ↵
              </kbd>
              <span className="ml-1.5">{t('hintEnter')}</span>
            </span>
            <span>
              <kbd className="pointer-events-none inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                ESC
              </kbd>
              <span className="ml-1.5">{t('hintClose')}</span>
            </span>
            <span className="ml-auto hidden sm:inline">{t('shortcut')}</span>
          </div>
        </DialogContent>
      </Dialog>

      <VehicleForm
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next)
          if (!next) setFormLookup(null)
        }}
        customers={customers}
        initialLookup={formLookup}
      />
    </>
  )
}
