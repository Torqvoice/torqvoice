'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocsLink } from '@/components/docs-link'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Check, ChevronsUpDown, Loader2, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { toast } from 'sonner'
import { useServiceType } from '@/components/service-type-context'
import { createInspection } from '../Actions/inspectionActions'
import { getTemplates } from '../Actions/templateActions'
import { searchVehicles } from '@/features/vehicles/Actions/vehicleActions'

interface TemplateOption {
  id: string
  name: string
  isDefault: boolean
}

interface VehicleOption {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
}

/** How many vehicles the selector shows at once; typing narrows it on the server. */
const VEHICLE_PAGE_SIZE = 50

function vehicleLabel(v: VehicleOption) {
  return `${v.year} ${v.make} ${v.model}${v.licensePlate ? ` (${v.licensePlate})` : ''}`
}

export function NewInspectionDialog({
  open,
  onOpenChange,
  templates: givenTemplates,
  preselectedVehicle,
  serviceRecordId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The workshop's templates; fetched here when the opener has none to hand. */
  templates?: TemplateOption[]
  preselectedVehicle?: VehicleOption
  /** The booked job this inspection is started from; it is linked to the inspection. */
  serviceRecordId?: string
}) {
  const t = useTranslations('inspections.new')
  const router = useRouter()
  const serviceType = useServiceType()
  const [isPending, startTransition] = useTransition()
  // Vehicles are searched on the server: a workshop can have tens of
  // thousands, and loading them all made this dialog slow to open.
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([])
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const vehicleRequestRef = useRef(0)
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(
    preselectedVehicle ?? null
  )
  const [fetchedTemplates, setFetchedTemplates] = useState<TemplateOption[]>([])
  const templates = givenTemplates ?? fetchedTemplates

  useEffect(() => {
    if (!open || givenTemplates) return
    getTemplates().then((result) => {
      if (result.success && result.data) {
        setFetchedTemplates(
          result.data.map((template) => ({
            id: template.id,
            name: template.name,
            isDefault: template.isDefault,
          }))
        )
      }
    })
  }, [open, givenTemplates])

  const defaultTemplate = templates.find((t) => t.isDefault)
  const [vehicleId, setVehicleId] = useState(preselectedVehicle?.id || '')
  const [templateId, setTemplateId] = useState(defaultTemplate?.id || '')
  const [mileage, setMileage] = useState('')
  const [vehiclePopoverOpen, setVehiclePopoverOpen] = useState(false)

  // Search as the user types, the most recently touched first when the box is empty
  useEffect(() => {
    if (!vehiclePopoverOpen) return
    const query = vehicleSearch.trim()
    const request = ++vehicleRequestRef.current
    setLoadingVehicles(true)
    const timer = setTimeout(
      async () => {
        try {
          const result = await searchVehicles(query || undefined, VEHICLE_PAGE_SIZE)
          if (request !== vehicleRequestRef.current) return
          setVehicleOptions(result.success && result.data ? result.data : [])
        } catch {
          if (request === vehicleRequestRef.current) setVehicleOptions([])
        } finally {
          if (request === vehicleRequestRef.current) setLoadingVehicles(false)
        }
      },
      query ? 300 : 0
    )
    return () => clearTimeout(timer)
  }, [vehiclePopoverOpen, vehicleSearch])

  useEffect(() => {
    if (open) {
      setVehicleId(preselectedVehicle?.id || '')
      setSelectedVehicle(preselectedVehicle ?? null)
      setTemplateId(defaultTemplate?.id || '')
      setMileage('')
    }
    // Keyed on the id: an opener that rebuilds the vehicle object each render
    // would otherwise reset the choice while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselectedVehicle?.id, defaultTemplate?.id])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const result = await createInspection({
        vehicleId,
        templateId,
        mileage: mileage ? parseInt(mileage, 10) : undefined,
        serviceRecordId,
      })

      if (result.success && result.data) {
        toast.success('Inspection created')
        onOpenChange(false)
        router.push(`/inspections/${result.data.id}`)
      } else {
        toast.error(result.error || 'Failed to create inspection')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DocsLink href="/docs/features/inspections" variant="hint" className="self-start" />
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('vehicle')}</Label>
            <Popover open={vehiclePopoverOpen} onOpenChange={setVehiclePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={vehiclePopoverOpen}
                  className="w-full justify-between font-normal"
                >
                  {vehicleId && selectedVehicle?.id === vehicleId
                    ? vehicleLabel(selectedVehicle)
                    : 'Select vehicle'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-(--radix-popover-trigger-width) min-w-64 p-0"
                align="start"
              >
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={t('searchVehicles')}
                    value={vehicleSearch}
                    onValueChange={setVehicleSearch}
                  />
                  <CommandList>
                    {loadingVehicles && vehicleOptions.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('loadingVehicles')}
                      </div>
                    ) : (
                      <CommandEmpty>{t('noVehicles')}</CommandEmpty>
                    )}
                    <CommandGroup>
                      {vehicleOptions.map((v) => {
                        const label = vehicleLabel(v)
                        return (
                          <CommandItem
                            key={v.id}
                            value={v.id}
                            onSelect={() => {
                              setVehicleId(v.id)
                              setSelectedVehicle(v)
                              setVehiclePopoverOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                vehicleId === v.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {label}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('template')}</Label>
              <Link
                href="/settings/templates?tab=inspections"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onOpenChange(false)}
              >
                <Settings className="h-3 w-3" />
                {t('manageTemplates')}
              </Link>
            </div>
            <Select value={templateId} onValueChange={setTemplateId} required>
              <SelectTrigger>
                <SelectValue placeholder={t('selectTemplate')} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? ' (Default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{serviceType === 'marine' ? 'Engine Hours' : 'Mileage'} (optional)</Label>
            <Input
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder={serviceType === 'marine' ? 'Current engine hours' : 'Current mileage'}
              min={0}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button
              data-save-shortcut
              type="submit"
              disabled={isPending || !vehicleId || !templateId}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Inspection
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
