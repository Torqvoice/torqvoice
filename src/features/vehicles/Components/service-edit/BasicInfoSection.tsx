'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
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
import Link from 'next/link'
import { Check, ChevronsUpDown, ExternalLink } from 'lucide-react'
import type { InitialData, VehicleOption, TeamMemberOption } from './form-types'

export interface BoardTechnicianOption {
  id: string
  name: string
}

interface CustomerInfo {
  id: string
  name: string
  company: string | null
}

interface BasicInfoSectionProps {
  initialData: InitialData
  vehicleId: string
  vehicleName: string
  selectedVehicleId: string
  setSelectedVehicleId: (id: string) => void
  vehicles: VehicleOption[]
  vehicleOpen: boolean
  setVehicleOpen: (open: boolean) => void
  type: string
  setType: (type: string) => void
  status: string
  setStatus: (status: string) => void
  techName: string
  setTechName: (name: string) => void
  techOpen: boolean
  setTechOpen: (open: boolean) => void
  teamMembers: TeamMemberOption[]
  boardTechnicians?: BoardTechnicianOption[]
  customer?: CustomerInfo | null
}

export function BasicInfoSection({
  initialData,
  vehicleName,
  selectedVehicleId,
  setSelectedVehicleId,
  vehicles,
  vehicleOpen,
  setVehicleOpen,
  type,
  setType,
  status,
  setStatus,
  techName,
  setTechName,
  techOpen,
  setTechOpen,
  teamMembers,
  boardTechnicians = [],
  customer,
}: BasicInfoSectionProps) {
  const t = useTranslations('service.basicInfo')
  const selectedVehicleLabel = useMemo(() => {
    if (vehicles.length === 0) return vehicleName
    const v = vehicles.find((v) => v.id === selectedVehicleId)
    return v?.label || vehicleName
  }, [selectedVehicleId, vehicles, vehicleName])

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <h3 className="text-sm font-semibold">{t('title')}</h3>

      {vehicles.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{t('vehicle')}</Label>
            <Link
              href={`/vehicles/${selectedVehicleId}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('open')}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <Popover open={vehicleOpen} onOpenChange={setVehicleOpen} modal={true}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={vehicleOpen}
                className="w-full justify-between font-normal"
              >
                <span className="truncate">{selectedVehicleLabel}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder={t('searchVehicles')} />
                <CommandList className="max-h-60 overflow-y-auto">
                  <CommandEmpty>{t('noVehicleFound')}</CommandEmpty>
                  <CommandGroup>
                    {vehicles.map((v) => (
                      <CommandItem
                        key={v.id}
                        value={v.label}
                        onSelect={() => {
                          setSelectedVehicleId(v.id)
                          setVehicleOpen(false)
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${selectedVehicleId === v.id ? 'opacity-100' : 'opacity-0'}`}
                        />
                        {v.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {customer && (
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('customer')}</p>
            <Link
              href={`/customers/${customer.id}`}
              className="text-sm font-medium hover:underline"
            >
              {customer.name}
            </Link>
            {customer.company && (
              <p className="text-xs text-muted-foreground">{customer.company}</p>
            )}
          </div>
          <Link
            href={`/customers/${customer.id}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('open')}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

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

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="serviceDate" className="text-xs">{t('date')}</Label>
          <Input
            id="serviceDate"
            name="serviceDate"
            type="date"
            defaultValue={initialData.serviceDate || new Date().toISOString().split('T')[0]}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('type')}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
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
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="mileage" className="text-xs">{t('mileage')}</Label>
          <Input
            id="mileage"
            name="mileage"
            type="number"
            placeholder="50000"
            defaultValue={initialData.mileage ?? ''}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('status')}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
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

      <TechnicianPicker
        techName={techName}
        setTechName={setTechName}
        techOpen={techOpen}
        setTechOpen={setTechOpen}
        boardTechnicians={boardTechnicians}
        teamMembers={teamMembers}
      />

      <div className="space-y-1">
        <Label htmlFor="invoiceNumber" className="text-xs">{t('invoiceNumber')}</Label>
        <Input
          id="invoiceNumber"
          name="invoiceNumber"
          placeholder="2026-1001"
          defaultValue={initialData.invoiceNumber || ''}
        />
      </div>
    </div>
  )
}

function TechnicianPicker({
  techName,
  setTechName,
  techOpen,
  setTechOpen,
  boardTechnicians,
  teamMembers,
}: {
  techName: string
  setTechName: (name: string) => void
  techOpen: boolean
  setTechOpen: (open: boolean) => void
  boardTechnicians: BoardTechnicianOption[]
  teamMembers: TeamMemberOption[]
}) {
  const t = useTranslations('service.basicInfo.techPicker')
  const [search, setSearch] = useState('')

  return (
    <div className="space-y-1">
      <Label className="text-xs">Technician</Label>
      <Popover
        open={techOpen}
        onOpenChange={(open) => {
          setTechOpen(open)
          if (open) setSearch('')
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={techOpen}
            className="w-full justify-between font-normal"
          >
            {techName || <span className="text-muted-foreground">{t('placeholder')}</span>}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t('searchPlaceholder')}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {search ? (
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-sm text-left"
                    onClick={() => {
                      setTechName(search)
                      setTechOpen(false)
                    }}
                  >
                    {t('useCustom', { search })}
                  </button>
                ) : (
                  t('typePrompt')
                )}
              </CommandEmpty>
              {boardTechnicians.length > 0 && (
                <CommandGroup heading={t('boardTechnicians')}>
                  {boardTechnicians.map((tech) => (
                    <CommandItem
                      key={tech.id}
                      value={tech.name}
                      onSelect={() => {
                        setTechName(tech.name)
                        setTechOpen(false)
                      }}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${techName === tech.name ? 'opacity-100' : 'opacity-0'}`}
                      />
                      {tech.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {teamMembers.length > 0 && (
                <CommandGroup heading={t('teamMembers')}>
                  {teamMembers.map((member) => (
                    <CommandItem
                      key={member.id}
                      value={member.name}
                      onSelect={() => {
                        setTechName(member.name)
                        setTechOpen(false)
                      }}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${techName === member.name ? 'opacity-100' : 'opacity-0'}`}
                      />
                      {member.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
