'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AddPersonDialog } from '@/features/team/Components/AddPersonDialog'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Clock,
  Plus,
  Settings,
  UserPlus,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { DateTimePicker } from '@/components/ui/datetime-picker'
import {
  assignTechnician,
  checkSlotAvailability,
  findNextSlot,
  scheduleJob,
  updateServiceTimes,
} from '@/features/workboard/Actions/boardActions'
import { createTechnician } from '@/features/workboard/Actions/technicianActions'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const HOUR_PRESETS = [1, 2, 4, 5, 7]

/** Sentinel for the "no bay" option: a Select item cannot carry an empty value. */
const NO_BAY = '__none__'

interface Technician {
  id: string
  name: string
  userId?: string | null
}

interface WorkBay {
  id: string
  name: string
}

interface OrgMember {
  id: string
  name: string | null
  email: string
}

interface ScheduleTimesSectionProps {
  serviceRecordId: string
  technicians?: Technician[]
  workBays?: WorkBay[]
  orgMembers?: OrgMember[]
  initialStartDateTime?: string | null
  initialEndDateTime?: string | null
  initialTechnicianId?: string | null
  initialWorkBayId?: string | null
  onSaved?: () => void
}

export function ScheduleTimesSection({
  serviceRecordId,
  technicians: initialTechnicians = [],
  workBays = [],
  orgMembers = [],
  initialStartDateTime,
  initialEndDateTime,
  initialTechnicianId,
  initialWorkBayId,
  onSaved,
}: ScheduleTimesSectionProps) {
  const t = useTranslations('service.schedule')
  const router = useRouter()
  const [selectedTechId, setSelectedTechId] = useState(initialTechnicianId || '')
  const [selectedBayId, setSelectedBayId] = useState(initialWorkBayId || NO_BAY)
  const [techOpen, setTechOpen] = useState(false)
  const [technicians, setTechnicians] = useState<Technician[]>(initialTechnicians)
  const [techSearch, setTechSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [addingPerson, setAddingPerson] = useState(false)
  const [showNewInput, setShowNewInput] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Opening a job that is already double-booked should say so, not wait for
  // somebody to change something first.
  useEffect(() => {
    if (!initialStartDateTime || !initialEndDateTime) return
    if (!initialTechnicianId && !initialWorkBayId) return
    void checkSlotAvailability({
      start: new Date(initialStartDateTime).toISOString(),
      end: new Date(initialEndDateTime).toISOString(),
      technicianId: initialTechnicianId || null,
      workBayId: initialWorkBayId || null,
      excludeId: serviceRecordId,
    }).then((res) => {
      if (res.success && res.data) setConflicts(res.data.conflicts)
    })
  }, [
    initialStartDateTime,
    initialEndDateTime,
    initialTechnicianId,
    initialWorkBayId,
    serviceRecordId,
  ])
  const [newTechName, setNewTechName] = useState('')

  const [startDateTime, setStartDateTime] = useState<Date | undefined>(
    initialStartDateTime ? new Date(initialStartDateTime) : new Date()
  )
  const [endDateTime, setEndDateTime] = useState<Date | undefined>(
    initialEndDateTime ? new Date(initialEndDateTime) : new Date(Date.now() + 3600000)
  )

  /** What the current selection would double-book, if anything. */
  const [conflicts, setConflicts] = useState<
    {
      id: string
      label: string
      start: string
      end: string
      onTechnician: boolean
      onBay: boolean
    }[]
  >([])
  const [checking, setChecking] = useState(false)
  const [finding, setFinding] = useState(false)

  const bayId = selectedBayId === NO_BAY ? null : selectedBayId

  /**
   * Ask whether a slot is free, for the resources currently chosen.
   *
   * Advisory rather than blocking: a shop sometimes double-books a person on
   * purpose, and refusing the booking outright would make the board lie about
   * what the day actually looks like. Saying so plainly is the useful part.
   */
  const checkSlot = async (start: Date, end: Date, techId: string, bay: string | null) => {
    if ((!techId && !bay) || end <= start) {
      setConflicts([])
      return
    }
    setChecking(true)
    const res = await checkSlotAvailability({
      start: start.toISOString(),
      end: end.toISOString(),
      technicianId: techId || null,
      workBayId: bay,
      excludeId: serviceRecordId,
    })
    setChecking(false)
    setConflicts(res.success && res.data ? res.data.conflicts : [])
  }

  /** Move the booking to the first slot that fits, inside working hours. */
  const pickNextAvailable = async () => {
    const minutes =
      startDateTime && endDateTime
        ? Math.max(15, Math.round((endDateTime.getTime() - startDateTime.getTime()) / 60000))
        : 60
    setFinding(true)
    const res = await findNextSlot({
      durationMinutes: minutes,
      technicianId: selectedTechId || null,
      workBayId: bayId,
      excludeId: serviceRecordId,
      from: new Date().toISOString(),
    })
    setFinding(false)
    if (!res.success || !res.data?.start || !res.data?.end) {
      toast.error(t('noSlotFound'))
      return
    }
    const start = new Date(res.data.start)
    const end = new Date(res.data.end)
    setStartDateTime(start)
    setEndDateTime(end)
    setConflicts([])
    await saveTimes(start, end, { skipCheck: true })
    toast.success(t('slotPicked'))
  }

  const saveTimes = async (start: Date, end: Date, opts?: { skipCheck?: boolean }) => {
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
      // Checked after the write rather than before it: the times save as they
      // always did, and the clash is reported against what is now booked.
      if (!opts?.skipCheck) void checkSlot(start, end, selectedTechId, bayId)
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
      if (startDateTime && endDateTime) void checkSlot(startDateTime, endDateTime, techId, bayId)
    } else {
      toast.error(t('failedAssign'))
      setSelectedTechId(initialTechnicianId || '')
    }
  }

  /**
   * Take the technician off the job. The bay and the booked times stay: the
   * work is still planned, it just has nobody's name on it yet.
   */
  const handleTechClear = async () => {
    const previous = selectedTechId
    setSelectedTechId('')
    setTechOpen(false)
    const res = await scheduleJob({
      id: serviceRecordId,
      type: 'serviceRecord',
      technicianId: null,
    })
    if (res.success) {
      onSaved?.()
      if (startDateTime && endDateTime) void checkSlot(startDateTime, endDateTime, '', bayId)
    } else {
      toast.error(res.error || t('failedUpdate'))
      setSelectedTechId(previous)
    }
  }

  const handleMemberSelect = async (member: OrgMember) => {
    // Check if a technician already exists for this user
    const existing = technicians.find((t) => t.userId === member.id)
    if (existing) {
      handleTechSelect(existing.id)
      return
    }
    setCreating(true)
    const res = await createTechnician({ name: member.name!, userId: member.id })
    setCreating(false)
    if (res.success && res.data) {
      const newTech = { id: res.data.id, name: res.data.name, userId: member.id }
      setTechnicians((prev) => [...prev, newTech])
      handleTechSelect(newTech.id)
    } else {
      toast.error(t('failedCreate'))
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

  const handleBaySelect = async (bayId: string) => {
    const previous = selectedBayId
    setSelectedBayId(bayId)
    const res = await scheduleJob({
      id: serviceRecordId,
      type: 'serviceRecord',
      workBayId: bayId === NO_BAY ? null : bayId,
    })
    if (res.success) {
      onSaved?.()
      const nextBay = bayId === NO_BAY ? null : bayId
      if (startDateTime && endDateTime)
        void checkSlot(startDateTime, endDateTime, selectedTechId, nextBay)
    } else {
      toast.error(res.error || t('failedUpdate'))
      setSelectedBayId(previous)
    }
  }

  const selectedTechName = technicians.find((t) => t.id === selectedTechId)?.name

  // Platform users that already have a linked technician
  const linkedUserIds = new Set(technicians.filter((t) => t.userId).map((t) => t.userId!))
  // Platform users without a technician record yet
  const unlinkedMembers = orgMembers.filter((m) => m.name && !linkedUserIds.has(m.id))
  // Technicians linked to platform users
  const linkedTechnicians = technicians.filter((t) => t.userId)
  // Custom technicians (not linked to any platform user)
  const customTechnicians = technicians.filter((t) => !t.userId)

  const searchLower = techSearch.toLowerCase()
  const exactMatch = technicians.some((t) => t.name.toLowerCase() === searchLower)

  const currentHours =
    startDateTime && endDateTime
      ? Math.round((endDateTime.getTime() - startDateTime.getTime()) / 3600000)
      : null

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t('title')}</h3>
        </div>
        <a
          href="https://torqvoice.com/docs/configuration/work-orders/technician-assignment"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('readMore')} →
        </a>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t('technician')}</Label>
          <Link
            href="/settings/workshop"
            target="_blank"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="h-3 w-3" />
            {t('setDefaults')}
          </Link>
        </div>
        <Popover open={techOpen} onOpenChange={setTechOpen} modal={true}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={techOpen}
              className="w-full justify-between font-normal"
            >
              <span className="truncate">{selectedTechName || t('selectTechnician')}</span>
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
                {/* The way off the job, the same as the bay select's "No work
                    bay". Without it a technician could be swapped but never
                    removed from here. */}
                <CommandGroup>
                  <CommandItem value={t('noTechnician')} onSelect={handleTechClear}>
                    <Check
                      className={cn('mr-2 h-4 w-4', selectedTechId ? 'opacity-0' : 'opacity-100')}
                    />
                    <span className="text-muted-foreground">{t('noTechnician')}</span>
                  </CommandItem>
                </CommandGroup>
                {/* Two different kinds of person, under two headings.
                    They used to share one, so somebody who books cars in read
                    as a mechanic, and choosing them quietly created a
                    technician record for an account the desk had never said
                    was one. The list still offers them, because assigning a
                    colleague on the spot is worth keeping; it just says which
                    is which. */}
                {linkedTechnicians.length > 0 && (
                  <CommandGroup heading={t('technicians')}>
                    {linkedTechnicians.map((tech) => (
                      <CommandItem
                        key={tech.id}
                        value={tech.name}
                        onSelect={() => handleTechSelect(tech.id)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedTechId === tech.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {tech.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {/* Custom technicians (not linked to platform users) */}
                {customTechnicians.length > 0 && (
                  <CommandGroup heading={t('customTechnicians')}>
                    {customTechnicians.map((tech) => (
                      <CommandItem
                        key={tech.id}
                        value={tech.name}
                        onSelect={() => handleTechSelect(tech.id)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedTechId === tech.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {tech.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {/* Colleagues who are not on the board yet.
                    This list was computed and then not rendered, which left no
                    way at all to put somebody on a job from here: the only
                    route was a phone icon on the team page, labelled as
                    something else. It was dropped because choosing a colleague
                    quietly turned them into a technician, and that is the part
                    worth keeping fixed, so the heading says what will happen
                    rather than the click doing it silently. */}
                {unlinkedMembers.length > 0 && (
                  <CommandGroup heading={t('notOnBoard')}>
                    {unlinkedMembers.map((member) => (
                      <CommandItem
                        key={member.id}
                        value={member.name ?? ''}
                        disabled={creating}
                        onSelect={() => handleMemberSelect(member)}
                      >
                        <UserPlus className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span className="flex-1">{member.name}</span>
                        <span className="text-muted-foreground text-xs">{t('putOnBoard')}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {/* Adding somebody is one workflow, and this is a door into
                    it rather than a fourth way of doing it. */}
                <CommandGroup>
                  <CommandItem value="__add_person__" onSelect={() => setAddingPerson(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('addSomeoneNew')}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <AddPersonDialog
        open={addingPerson}
        onOpenChange={setAddingPerson}
        onChanged={() => router.refresh()}
      />

      {workBays.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">{t('workBay')}</Label>
          <Select value={selectedBayId} onValueChange={handleBaySelect}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('selectWorkBay')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_BAY}>{t('noWorkBay')}</SelectItem>
              {workBays.map((bay) => (
                <SelectItem key={bay.id} value={bay.id}>
                  {bay.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">{t('startTime')}</Label>
        {mounted ? (
          <DateTimePicker
            value={startDateTime}
            onChange={(d) => {
              setStartDateTime(d)
              if (d) {
                const newEnd = new Date(d.getTime() + 3600000)
                setEndDateTime(newEnd)
                saveTimes(d, newEnd)
              }
            }}
            granularity="minute"
            hourCycle={24}
            placeholder={t('startTime')}
            displayFormat={{ hour24: 'PPP HH:mm' }}
          />
        ) : (
          <div className="h-9 rounded-md border" />
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{t('endTime')}</Label>
        {mounted ? (
          <DateTimePicker
            value={endDateTime}
            onChange={(d) => {
              setEndDateTime(d)
              if (d && startDateTime) saveTimes(startDateTime, d)
            }}
            granularity="minute"
            hourCycle={24}
            placeholder={t('endTime')}
            displayFormat={{ hour24: 'PPP HH:mm' }}
          />
        ) : (
          <div className="h-9 rounded-md border" />
        )}
      </div>

      {conflicts.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-900/60 dark:bg-amber-950/40">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {t('slotTaken', { count: conflicts.length })}
              </p>
              <ul className="space-y-0.5">
                {conflicts.slice(0, 3).map((c) => (
                  <li
                    key={c.id}
                    className="text-[11px] leading-snug text-amber-800 dark:text-amber-300"
                  >
                    {c.label || t('anotherJob')} ·{' '}
                    {new Date(c.start).toLocaleString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' – '}
                    {new Date(c.end).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {c.onTechnician && c.onBay
                      ? t('clashBoth')
                      : c.onTechnician
                        ? t('clashTechnician')
                        : t('clashBay')}
                  </li>
                ))}
              </ul>
              {/* Advisory, not a block: a shop that means to double-book still
                  can, and the board keeps telling the truth about the day. */}
              <p className="text-[11px] text-amber-700 dark:text-amber-400">{t('bookedAnyway')}</p>
            </div>
          </div>
        </div>
      )}

      <Button
        type="button"
        variant={conflicts.length > 0 ? 'default' : 'outline'}
        size="sm"
        className="w-full"
        disabled={finding || checking}
        onClick={pickNextAvailable}
      >
        <Wand2 className="mr-1.5 h-3.5 w-3.5" />
        {finding ? t('findingSlot') : t('pickNextAvailable')}
      </Button>

      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Duration presets</span>
        <div className="flex flex-wrap gap-1">
          {HOUR_PRESETS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => handlePreset(h)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                currentHours === h
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted'
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
