'use client'

import { SectionFrame } from '@/components/section-frame'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useModernWorkOrder } from '@/components/work-order-layout-context'
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
  CalendarOff,
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
import { useDateSettings } from '@/components/date-settings-context'
import {
  addJobHelper,
  assignTechnician,
  checkSlotAvailability,
  findNextSlot,
  getTechnicianDayLoad,
  removeJobHelper,
  scheduleJob,
  setPromisedTime,
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
  /** The technician's colour on the work board. */
  color?: string | null
  /** Minutes in their working day; the board's default is eight hours. */
  dailyCapacity?: number | null
  /** What they are good at, in the workshop's words. */
  skills?: string | null
}

const DEFAULT_DAILY_CAPACITY = 480

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Minutes as hours with at most one decimal: 330 is 5.5, 480 is 8. */
function hoursOf(minutes: number): string {
  return (Math.round(minutes / 6) / 10).toLocaleString()
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
  /** Everybody else on the job with that technician, as technician ids. */
  initialHelperIds?: string[]
  initialWorkBayId?: string | null
  /** When the customer was told the vehicle would be ready, ISO. */
  initialPromisedAt?: string | null
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
  initialHelperIds,
  initialWorkBayId,
  initialPromisedAt,
  onSaved,
}: ScheduleTimesSectionProps) {
  const t = useTranslations('service.schedule')
  const tCal = useTranslations('workshopCalendar')
  const router = useRouter()
  const modern = useModernWorkOrder()
  // Booked times belong to the workshop's clock, not to the clock of whoever
  // happens to be looking at them.
  const { timezone } = useDateSettings()
  const [selectedTechId, setSelectedTechId] = useState(initialTechnicianId || '')
  // Who else is on the job. Only ever beside a technician: a job with nobody
  // leading it has no helpers either.
  const [helperIds, setHelperIds] = useState<string[]>(initialHelperIds ?? [])
  // What the server says now, when the page reads the job again: the board,
  // or somebody at another desk, may have changed who is on it. Keyed on the
  // ids themselves, because the array is a new one on every render.
  const helperKey = (initialHelperIds ?? []).join(',')
  useEffect(() => {
    setSelectedTechId(initialTechnicianId || '')
    setHelperIds(helperKey ? helperKey.split(',') : [])
  }, [initialTechnicianId, helperKey])
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
    void checkSlotAvailability({
      start: new Date(initialStartDateTime).toISOString(),
      end: new Date(initialEndDateTime).toISOString(),
      technicianId: initialTechnicianId || null,
      helperIds: helperKey ? helperKey.split(',') : [],
      workBayId: initialWorkBayId || null,
      excludeId: serviceRecordId,
    }).then((res) => {
      if (res.success && res.data) {
        setConflicts(res.data.conflicts)
        setClosed({
          names: res.data.closures?.map((c) => c.name) ?? [],
          weekday: !!res.data.closedWeekday,
        })
      }
    })
  }, [
    initialStartDateTime,
    initialEndDateTime,
    initialTechnicianId,
    helperKey,
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

  const [promisedAt, setPromisedAt] = useState<Date | undefined>(
    initialPromisedAt ? new Date(initialPromisedAt) : undefined
  )

  /** Saved as it is set, like the times above it; clearing takes the promise away. */
  const savePromisedAt = async (next: Date | undefined) => {
    const previous = promisedAt
    setPromisedAt(next)
    const res = await setPromisedTime({ id: serviceRecordId, promisedAt: next ?? null })
    if (res.success) {
      onSaved?.()
      // The header says when the vehicle was promised, from the record.
      router.refresh()
    } else {
      toast.error(res.error || t('failedUpdate'))
      setPromisedAt(previous)
    }
  }

  /** What the current selection would double-book, if anything. */
  const [conflicts, setConflicts] = useState<
    {
      id: string
      /** `absence` is the technician's time off rather than other work. */
      kind?: string
      label: string
      start: string
      end: string
      onTechnician: boolean
      onBay: boolean
      /** Who on this job is double-booked, as technician ids. */
      people?: string[]
    }[]
  >([])
  /** The workshop's own closures the booking falls in, whoever it is for. */
  const [closed, setClosed] = useState<{ names: string[]; weekday: boolean }>({
    names: [],
    weekday: false,
  })
  const [checking, setChecking] = useState(false)
  const [finding, setFinding] = useState(false)

  // How full each technician's day is, on the day this job is booked. Only
  // the overhauled page draws it, so only that page asks.
  const [dayLoad, setDayLoad] = useState<Record<string, number>>({})
  // Who is away that day, so the list can say so beside their name.
  const [dayAway, setDayAway] = useState<
    Record<string, { reason: string; allDay: boolean; from: string | null; until: string | null }>
  >({})
  const loadDay = startDateTime ? startDateTime.toISOString() : null
  // Read through a ref: a save calls this from a closure made before the
  // date changed, and asking about that old day afterwards drew the old day's
  // load (and nobody away) under the new date.
  const loadDayRef = useRef(loadDay)
  loadDayRef.current = loadDay
  const refreshDayLoad = useCallback(async () => {
    const day = loadDayRef.current
    if (!modern || !day) return
    const res = await getTechnicianDayLoad({ day })
    // A newer day was asked for while this one was on its way.
    if (day !== loadDayRef.current) return
    if (res.success && res.data) {
      setDayLoad(res.data.minutes)
      setDayAway(res.data.away ?? {})
    }
  }, [modern])
  useEffect(() => {
    void refreshDayLoad()
  }, [refreshDayLoad, loadDay])

  const bayId = selectedBayId === NO_BAY ? null : selectedBayId

  /**
   * Ask whether a slot is free, for the resources currently chosen.
   *
   * Advisory rather than blocking: a shop sometimes double-books a person on
   * purpose, and refusing the booking outright would make the board lie about
   * what the day actually looks like. Saying so plainly is the useful part.
   */
  const checkSlot = async (
    start: Date,
    end: Date,
    techId: string,
    bay: string | null,
    helpers: string[] = helperIds
  ) => {
    if (end <= start) {
      setConflicts([])
      setClosed({ names: [], weekday: false })
      return
    }
    setChecking(true)
    const res = await checkSlotAvailability({
      start: start.toISOString(),
      end: end.toISOString(),
      technicianId: techId || null,
      // The slot has to suit everybody on the job, not only its technician.
      helperIds: helpers,
      workBayId: bay,
      excludeId: serviceRecordId,
    })
    setChecking(false)
    setConflicts(res.success && res.data ? res.data.conflicts : [])
    setClosed({
      names: res.success && res.data ? (res.data.closures?.map((c) => c.name) ?? []) : [],
      weekday: res.success && res.data ? !!res.data.closedWeekday : false,
    })
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
      helperIds,
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
      void refreshDayLoad()
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
    const previousTech = selectedTechId
    const previousHelpers = helperIds
    setSelectedTechId(techId)
    // A helper who takes the job over swaps places with whoever had it, so
    // the same people are still on it. Drawn at once, then settled below by
    // what the server actually wrote.
    if (previousHelpers.includes(techId)) {
      setHelperIds([
        ...previousHelpers.filter((id) => id !== techId),
        ...(previousTech ? [previousTech] : []),
      ])
    }
    setTechOpen(false)
    const res = await assignTechnician({
      id: serviceRecordId,
      technicianId: techId,
      type: 'serviceRecord',
    })
    if (res.success) {
      const helpers = res.data?.helperIds ?? []
      setHelperIds(helpers)
      onSaved?.()
      void refreshDayLoad()
      if (startDateTime && endDateTime)
        void checkSlot(startDateTime, endDateTime, techId, bayId, helpers)
    } else {
      // A role that may not change the work board is told so, and who can
      // change that, rather than that "it failed" with nothing to act on.
      toast.error(res.forbidden ? t('assignNotAllowed') : t('failedAssign'))
      setSelectedTechId(previousTech)
      setHelperIds(previousHelpers)
    }
  }

  /**
   * Put somebody on the job beside its technician, or take them off it. An
   * apprentice working with whoever is teaching them, a second pair of hands
   * on a big job: the work is in their day and on their phone as well.
   */
  const toggleHelper = async (techId: string) => {
    const previous = helperIds
    const helping = previous.includes(techId)
    setHelperIds(helping ? previous.filter((id) => id !== techId) : [...previous, techId])
    const res = await (helping ? removeJobHelper : addJobHelper)({
      id: serviceRecordId,
      technicianId: techId,
    })
    if (res.success && res.data) {
      const helpers = res.data.helperIds
      setHelperIds(helpers)
      onSaved?.()
      void refreshDayLoad()
      if (startDateTime && endDateTime)
        void checkSlot(startDateTime, endDateTime, selectedTechId, bayId, helpers)
    } else {
      toast.error(res.forbidden ? t('assignNotAllowed') : t('failedHelper'))
      setHelperIds(previous)
    }
  }

  /**
   * Take the technician off the job. The bay and the booked times stay: the
   * work is still planned, it just has nobody's name on it yet.
   */
  const handleTechClear = async () => {
    const previous = selectedTechId
    const previousHelpers = helperIds
    setSelectedTechId('')
    // Nobody's name on the job means nobody: the helpers go with the technician.
    setHelperIds([])
    setTechOpen(false)
    const res = await scheduleJob({
      id: serviceRecordId,
      type: 'serviceRecord',
      technicianId: null,
    })
    if (res.success) {
      onSaved?.()
      void refreshDayLoad()
      if (startDateTime && endDateTime) void checkSlot(startDateTime, endDateTime, '', bayId, [])
    } else {
      toast.error(res.error || t('failedUpdate'))
      setSelectedTechId(previous)
      setHelperIds(previousHelpers)
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
  const techNameOf = (id: string) => technicians.find((t) => t.id === id)?.name
  /** Who a clash is about, by name, once the job is more than one person. */
  const clashNames = (people: string[] | undefined) =>
    helperIds.length > 0
      ? (people ?? []).map(techNameOf).filter((name): name is string => !!name)
      : []

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

  const techPickerContent = (
    <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
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
              <Check className={cn('mr-2 h-4 w-4', selectedTechId ? 'opacity-0' : 'opacity-100')} />
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
  )

  return (
    <SectionFrame
      className="rounded-lg border p-3 space-y-3"
      icon={Clock}
      title={t('assignedTitle')}
      action={
        <Link
          href="/work-board"
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('boardLink')}
        </Link>
      }
      contentClassName="space-y-3"
      header={
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
      }
    >
      {modern ? (
        <div className="space-y-2">
          <div role="radiogroup" aria-label={t('technician')} className="space-y-1.5">
            {technicians.map((tech) => {
              const selected = tech.id === selectedTechId
              const helping = !selected && helperIds.includes(tech.id)
              const capacity = tech.dailyCapacity || DEFAULT_DAILY_CAPACITY
              const booked = dayLoad[tech.id] ?? 0
              const full = booked >= capacity
              const away = dayAway[tech.id]
              const awayReason = away
                ? tCal.has(`reasons.${away.reason}`)
                  ? tCal(`reasons.${away.reason}`)
                  : away.reason
                : null
              return (
                // The row is two controls side by side: the name chooses the
                // job's technician, as it always did, and the mark at the end
                // puts this person on the job as well. A button cannot hold
                // another button, so the row itself is only the frame.
                <div
                  key={tech.id}
                  data-testid={`tech-row-${tech.id}`}
                  className={cn(
                    'flex items-stretch rounded-lg border transition-colors',
                    selected
                      ? 'border-primary bg-primary/10'
                      : helping
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-card-edge hover:border-primary/40 hover:bg-muted/50'
                  )}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      if (!selected) void handleTechSelect(tech.id)
                    }}
                    // The load column is narrower than it was before a row
                    // could also carry the mark at its end: the card is a
                    // sidebar, and the width that mark takes has to come from
                    // somewhere other than the person's name.
                    className="grid min-w-0 flex-1 cursor-pointer grid-cols-[2.25rem_minmax(0,1fr)_4rem] items-center gap-2.5 rounded-lg py-2 pr-2 pl-2.5 text-left disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold',
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : helping
                            ? 'bg-primary/20 text-primary'
                            : 'bg-muted'
                      )}
                    >
                      {initialsOf(tech.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold" title={tech.name}>
                        {tech.name}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {/* On the line under the name, so the name keeps its
                            width. Only worth saying once there is somebody
                            to lead. */}
                        {selected && helperIds.length > 0 && (
                          <span className="shrink-0 rounded bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">
                            {t('lead')}
                          </span>
                        )}
                        {helping && !away ? (
                          <span
                            className="min-w-0 truncate text-xs font-medium text-primary"
                            title={t('alsoOnJob')}
                          >
                            {t('alsoOnJob')}
                          </span>
                        ) : away ? (
                          <span
                            className="min-w-0 truncate text-xs font-medium text-amber-700 dark:text-amber-400"
                            data-testid="tech-away"
                          >
                            {/* On the job and away that day is the thing to
                              notice, so the row says both. */}
                            {helping && `${t('alsoOnJob')} · `}
                            {away.allDay
                              ? tCal('schedule.away', { reason: awayReason ?? '' })
                              : `${tCal('schedule.away', { reason: awayReason ?? '' })} · ${[away.from, away.until].filter(Boolean).join('-')}`}
                          </span>
                        ) : (
                          <span className="min-w-0 truncate text-xs text-muted-foreground">
                            {tech.skills ||
                              (full
                                ? t('loadFull')
                                : t('loadFree', { hours: hoursOf(capacity - booked) }))}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="text-right text-xs tabular-nums text-muted-foreground">
                        {t('loadOf', { booked: hoursOf(booked), capacity: hoursOf(capacity) })}
                      </span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn(
                            'block h-full rounded-full',
                            full ? 'bg-destructive' : 'bg-foreground/50'
                          )}
                          style={{
                            width: `${Math.min(100, Math.round((booked / capacity) * 100))}%`,
                          }}
                        />
                      </span>
                    </span>
                  </button>
                  {/* Somebody has to have the job before anybody can help on
                    it, and the technician is on it already. */}
                  {selectedTechId && !selected && (
                    <button
                      type="button"
                      aria-pressed={helping}
                      aria-label={
                        helping
                          ? t('helperRemove', { name: tech.name })
                          : t('helperAdd', { name: tech.name })
                      }
                      title={
                        helping
                          ? t('helperRemove', { name: tech.name })
                          : t('helperAdd', { name: tech.name })
                      }
                      onClick={() => void toggleHelper(tech.id)}
                      className={cn(
                        'flex w-8 shrink-0 cursor-pointer items-center justify-center rounded-r-lg border-l transition-colors',
                        helping
                          ? 'border-primary/30 text-primary hover:bg-primary/10'
                          : 'border-card-edge text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {helping ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {/* Everything the list cannot say: nobody at all, a colleague who is
              not a technician yet, somebody new. The same picker the classic
              page opens, behind a quieter door. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Popover open={techOpen} onOpenChange={setTechOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    {technicians.length === 0 ? t('selectTechnician') : t('someoneElse')}
                  </Button>
                </PopoverTrigger>
                {techPickerContent}
              </Popover>
              <Link
                href="/settings/workshop"
                target="_blank"
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Settings className="h-3.5 w-3.5" />
                {t('setDefaults')}
              </Link>
            </div>
            {startDateTime && technicians.length > 0 && (
              <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                {t('loadOn', {
                  date: startDateTime.toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    timeZone: timezone || undefined,
                  }),
                })}
              </span>
            )}
          </div>
        </div>
      ) : (
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
            {techPickerContent}
          </Popover>
          {/* Who else is on the job, once somebody has it. */}
          {selectedTechId && technicians.some((tech) => tech.id !== selectedTechId) && (
            <div className="space-y-1 pt-1">
              <span className="text-xs font-medium text-muted-foreground">{t('alsoOnJob')}</span>
              <div className="flex flex-wrap gap-1">
                {technicians
                  .filter((tech) => tech.id !== selectedTechId)
                  .map((tech) => {
                    const helping = helperIds.includes(tech.id)
                    return (
                      <button
                        key={tech.id}
                        type="button"
                        aria-pressed={helping}
                        title={
                          helping
                            ? t('helperRemove', { name: tech.name })
                            : t('helperAdd', { name: tech.name })
                        }
                        onClick={() => void toggleHelper(tech.id)}
                        className={cn(
                          'cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          helping
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-foreground hover:bg-muted'
                        )}
                      >
                        {tech.name}
                      </button>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* When the vehicle is in: the two times, the quick ways of setting
          them, and what that slot clashes with. The slot finder writes these
          two fields, so it belongs with them rather than under the promise,
          where it read as a way of promising a time. */}
      <div className="space-y-3">
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
              timeZone={timezone}
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
              timeZone={timezone}
              granularity="minute"
              hourCycle={24}
              placeholder={t('endTime')}
              displayFormat={{ hour24: 'PPP HH:mm' }}
            />
          ) : (
            <div className="h-9 rounded-md border" />
          )}
        </div>

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{t('durationPresets')}</span>
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

        {(closed.names.length > 0 || closed.weekday) && (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-900/60 dark:bg-amber-950/40"
            data-testid="schedule-closed"
          >
            <div className="flex items-start gap-2">
              <CalendarOff className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  {closed.names.length > 0
                    ? tCal('schedule.closed', { names: closed.names.join(', ') })
                    : tCal('schedule.closedWeekday')}
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {tCal('schedule.bookedAnyway')}
                </p>
              </div>
            </div>
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-900/60 dark:bg-amber-950/40">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  {conflicts.every((c) => c.kind === 'absence')
                    ? helperIds.length > 0
                      ? tCal('schedule.awayHeadingTeam')
                      : tCal('schedule.awayHeading')
                    : t('slotTaken', { count: conflicts.length })}
                </p>
                <ul className="space-y-0.5">
                  {conflicts.slice(0, 3).map((c) => (
                    <li
                      key={c.id}
                      className="text-[11px] leading-snug text-amber-800 dark:text-amber-300"
                    >
                      {c.kind === 'absence' ? (
                        // Time off is days, not a slot: say which days, and
                        // the clock only where it starts or ends in a day.
                        <>
                          {/* With more than one person on the job, whose
                              time off it is has to be said. */}
                          {clashNames(c.people).length > 0 &&
                            `${clashNames(c.people).join(', ')}: `}
                          {tCal('schedule.awayConflict', {
                            reason: tCal.has(`reasons.${c.label}`)
                              ? tCal(`reasons.${c.label}`)
                              : c.label,
                          })}
                          {' · '}
                          {awayWhen(c.start, c.end, timezone)}
                        </>
                      ) : (
                        <>
                          {c.label || t('anotherJob')} ·{' '}
                          {new Date(c.start).toLocaleString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: timezone || undefined,
                          })}
                          {' – '}
                          {new Date(c.end).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: timezone || undefined,
                          })}
                          {' · '}
                          {c.onTechnician && c.onBay
                            ? t('clashBoth')
                            : c.onTechnician
                              ? clashNames(c.people).length > 0
                                ? t('clashPeople', {
                                    count: clashNames(c.people).length,
                                    names: clashNames(c.people).join(', '),
                                  })
                                : t('clashTechnician')
                              : t('clashBay')}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {/* Advisory, not a block: a shop that means to double-book still
                    can, and the board keeps telling the truth about the day. */}
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {t('bookedAnyway')}
                </p>
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
      </div>

      {/* Not when the work is booked, but what the customer was told, so
          it stands on its own below the booking. */}
      <div className="border-t border-card-edge pt-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{t('promisedAt')}</Label>
            {promisedAt && (
              <button
                type="button"
                onClick={() => void savePromisedAt(undefined)}
                className="cursor-pointer text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default"
              >
                {t('promisedClear')}
              </button>
            )}
          </div>
          {mounted ? (
            <DateTimePicker
              value={promisedAt}
              onChange={(d) => {
                if (d) void savePromisedAt(d)
              }}
              timeZone={timezone}
              granularity="minute"
              hourCycle={24}
              placeholder={t('promisedPlaceholder')}
              displayFormat={{ hour24: 'PPP HH:mm' }}
            />
          ) : (
            <div className="h-9 rounded-md border" />
          )}
        </div>
      </div>
    </SectionFrame>
  )
}

/** Hours and minutes past local midnight of an instant in the workshop's zone. */
function clockIn(at: Date, timeZone: string | undefined): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(at)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

/**
 * When a technician is away, as days: "16 Nov – 17 Nov", or with a clock
 * only where the time off starts or ends inside a day. The end of a stretch
 * is the midnight after its last day, which reads as that last day.
 */
function awayWhen(startIso: string, endIso: string, timeZone: string | null | undefined): string {
  const zone = timeZone || undefined
  const start = new Date(startIso)
  let end = new Date(endIso)
  const startsAtMidnight = clockIn(start, zone) === 0
  const endsAtMidnight = clockIn(end, zone) === 0
  if (endsAtMidnight) end = new Date(end.getTime() - 60_000)
  const day = (at: Date) =>
    at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: zone })
  const dayAndClock = (at: Date) =>
    at.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zone,
    })
  const from = startsAtMidnight ? day(start) : dayAndClock(start)
  const to = endsAtMidnight ? day(end) : dayAndClock(end)
  return from === to ? from : `${from} – ${to}`
}
