'use client'

import { useMemo, useState } from 'react'
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
  const selectedVehicleLabel = useMemo(() => {
    if (vehicles.length === 0) return vehicleName
    const v = vehicles.find((v) => v.id === selectedVehicleId)
    return v?.label || vehicleName
  }, [selectedVehicleId, vehicles, vehicleName])

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <h3 className="text-sm font-semibold">Basic Information</h3>

      {vehicles.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Vehicle</Label>
            <Link
              href={`/vehicles/${selectedVehicleId}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Open
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
                <CommandInput placeholder="Search vehicles..." />
                <CommandList className="max-h-60 overflow-y-auto">
                  <CommandEmpty>No vehicle found.</CommandEmpty>
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
            <p className="text-xs text-muted-foreground">Customer</p>
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
            Open
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="title" className="text-xs">Title *</Label>
        <Input
          id="title"
          name="title"
          placeholder="Oil Change"
          defaultValue={initialData.title}
          maxLength={100}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="serviceDate" className="text-xs">Date</Label>
          <Input
            id="serviceDate"
            name="serviceDate"
            type="date"
            defaultValue={initialData.serviceDate || new Date().toISOString().split('T')[0]}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="repair">Repair</SelectItem>
              <SelectItem value="upgrade">Upgrade</SelectItem>
              <SelectItem value="inspection">Inspection</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="mileage" className="text-xs">Mileage</Label>
          <Input
            id="mileage"
            name="mileage"
            type="number"
            placeholder="50000"
            defaultValue={initialData.mileage ?? ''}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="waiting-parts">Waiting Parts</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
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
        <Label htmlFor="invoiceNumber" className="text-xs">Invoice Number</Label>
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
            {techName || <span className="text-muted-foreground">Select or type a name...</span>}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search or type name..."
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
                    Use &quot;{search}&quot;
                  </button>
                ) : (
                  'Type a name...'
                )}
              </CommandEmpty>
              {boardTechnicians.length > 0 && (
                <CommandGroup heading="Board Technicians">
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
                <CommandGroup heading="Team Members">
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
