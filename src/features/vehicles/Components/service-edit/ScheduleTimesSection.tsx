'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Check, ChevronsUpDown, Clock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { DateTimePicker } from '@/components/ui/datetime-picker'
import {
  assignTechnician,
  updateServiceTimes,
} from '@/features/workboard/Actions/boardActions'
import { createTechnician } from '@/features/workboard/Actions/technicianActions'
import { cn } from '@/lib/utils'

const HOUR_PRESETS = [1, 2, 4, 5, 7]

interface Technician {
  id: string
  name: string
}

interface ScheduleTimesSectionProps {
  serviceRecordId: string
  technicians?: Technician[]
  initialStartDateTime?: string | null
  initialEndDateTime?: string | null
  initialTechnicianId?: string | null
  onSaved?: () => void
}

export function ScheduleTimesSection({
  serviceRecordId,
  technicians: initialTechnicians = [],
  initialStartDateTime,
  initialEndDateTime,
  initialTechnicianId,
  onSaved,
}: ScheduleTimesSectionProps) {
  const t = useTranslations('service.schedule')
  const [selectedTechId, setSelectedTechId] = useState(initialTechnicianId || '')
  const [techOpen, setTechOpen] = useState(false)
  const [technicians, setTechnicians] = useState<Technician[]>(initialTechnicians)
  const [techSearch, setTechSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [showNewInput, setShowNewInput] = useState(false)
  const [newTechName, setNewTechName] = useState('')

  const [startDateTime, setStartDateTime] = useState<Date | undefined>(
    initialStartDateTime ? new Date(initialStartDateTime) : new Date(),
  )
  const [endDateTime, setEndDateTime] = useState<Date | undefined>(
    initialEndDateTime ? new Date(initialEndDateTime) : new Date(Date.now() + 3600000),
  )

  const saveTimes = async (start: Date, end: Date) => {
    if (end <= start) {
      toast.error(t('endBeforeStart'))
      return
    }
    const res = await updateServiceTimes({
      id: serviceRecordId,
      startDateTime: start,
      endDateTime: end,
    })
    if (res.success) {
      onSaved?.()
    } else {
      toast.error(res.error || t('failedUpdate'))
    }
  }

  const handlePreset = (hours: number) => {
    if (!startDateTime) return
    const newEnd = new Date(startDateTime.getTime() + hours * 3600000)
    setEndDateTime(newEnd)
    saveTimes(startDateTime, newEnd)
  }

  const handleTechSelect = async (techId: string) => {
    setSelectedTechId(techId)
    setTechOpen(false)
    const res = await assignTechnician({
      id: serviceRecordId,
      technicianId: techId,
      type: 'serviceRecord',
    })
    if (res.success) {
      onSaved?.()
    } else {
      toast.error(t('failedAssign'))
      setSelectedTechId(initialTechnicianId || '')
    }
  }

  const doCreateTechnician = async (name: string) => {
    if (!name.trim()) return
    setCreating(true)
    const res = await createTechnician({ name: name.trim() })
    setCreating(false)
    if (res.success && res.data) {
      const newTech = { id: res.data.id, name: res.data.name }
      setTechnicians((prev) => [...prev, newTech])
      setTechSearch('')
      setNewTechName('')
      setShowNewInput(false)
      handleTechSelect(newTech.id)
    } else {
      toast.error(t('failedCreate'))
    }
  }

  const selectedTechName = technicians.find((t) => t.id === selectedTechId)?.name

  const searchLower = techSearch.toLowerCase()
  const exactMatch = technicians.some((t) => t.name.toLowerCase() === searchLower)

  const currentHours = startDateTime && endDateTime
    ? Math.round((endDateTime.getTime() - startDateTime.getTime()) / 3600000)
    : null

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t('title')}</h3>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t('technician')}</Label>
        <Popover open={techOpen} onOpenChange={setTechOpen} modal={true}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={techOpen}
              className="w-full justify-between font-normal"
            >
              <span className="truncate">
                {selectedTechName || t('selectTechnician')}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={true}>
              <CommandInput
                placeholder={t('searchOrCreate')}
                value={techSearch}
                onValueChange={setTechSearch}
              />
              <CommandList className="max-h-60 overflow-y-auto">
                <CommandEmpty className="p-0" />
                <CommandGroup>
                  {technicians.map((tech) => (
                    <CommandItem
                      key={tech.id}
                      value={tech.name}
                      onSelect={() => handleTechSelect(tech.id)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedTechId === tech.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {tech.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {techSearch.trim() && !exactMatch && (
                  <CommandGroup>
                    <CommandItem
                      value={`__create__${techSearch}`}
                      onSelect={() => doCreateTechnician(techSearch)}
                      disabled={creating}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {creating ? t('creating') : t('createTechnician', { name: techSearch.trim() })}
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandSeparator />
                <CommandGroup>
                  {showNewInput ? (
                    <div className="flex items-center gap-1.5 px-2 py-1.5" onKeyDown={(e) => e.stopPropagation()}>
                      <Input
                        autoFocus
                        placeholder={t('newTechPlaceholder')}
                        value={newTechName}
                        onChange={(e) => setNewTechName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            doCreateTechnician(newTechName)
                          }
                          if (e.key === 'Escape') {
                            setShowNewInput(false)
                            setNewTechName('')
                          }
                        }}
                        className="h-7 text-sm"
                        disabled={creating}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 shrink-0"
                        disabled={creating || !newTechName.trim()}
                        onClick={() => doCreateTechnician(newTechName)}
                      >
                        {creating ? t('creating') : t('add')}
                      </Button>
                    </div>
                  ) : (
                    <CommandItem
                      value="__add_new__"
                      onSelect={() => setShowNewInput(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('addNew')}
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{t('startTime')}</Label>
        <DateTimePicker
          value={startDateTime}
          onChange={(d) => {
            setStartDateTime(d);
            if (d) {
              const newEnd = new Date(d.getTime() + 3600000);
              setEndDateTime(newEnd);
              saveTimes(d, newEnd);
            }
          }}
          granularity="minute"
          hourCycle={24}
          placeholder={t('startTime')}
          displayFormat={{ hour24: "PPP HH:mm" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{t('endTime')}</Label>
        <DateTimePicker
          value={endDateTime}
          onChange={(d) => {
            setEndDateTime(d);
            if (d && startDateTime) saveTimes(startDateTime, d);
          }}
          granularity="minute"
          hourCycle={24}
          placeholder={t('endTime')}
          displayFormat={{ hour24: "PPP HH:mm" }}
        />
      </div>

      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Duration presets</span>
        <div className="flex flex-wrap gap-1">
          {HOUR_PRESETS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => handlePreset(h)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                currentHours === h
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
