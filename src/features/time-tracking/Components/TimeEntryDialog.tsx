'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
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
import { zonedParts } from '@/lib/timezone'
import { cn } from '@/lib/utils'
import { createTimeEntry, searchTimesheetJobs, updateTimeEntry } from '../Actions/timesheetActions'
import {
  formatMinutes,
  minutesBetween,
  type SheetEntry,
  type SheetTechnician,
} from '../Lib/timesheet'

/** ISO instant to the "YYYY-MM-DDTHH:MM" a datetime-local input wants, on the workshop clock. */
function toWallClock(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

type JobOption = {
  id: string
  title: string
  status: string
  vehicleLabel: string | null
  licensePlate: string | null
}

/**
 * Add or correct one stretch of time.
 *
 * Every time here is the workshop's wall clock, whatever the manager's
 * browser thinks the hour is; the server parses it in the workshop's zone.
 * Correcting keeps the entry's technician and job fixed: moving hours to
 * another person or job is a delete and an add, and should look like one
 * in the audit log.
 */
export function TimeEntryDialog({
  open,
  onOpenChange,
  timeZone,
  technicians,
  entry,
  defaults,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  timeZone: string
  technicians: SheetTechnician[]
  /** Present when correcting; absent when adding. */
  entry?: SheetEntry | null
  defaults?: { technicianId?: string; dayKey?: string }
  onSaved: (saved: SheetEntry) => void
}) {
  const t = useTranslations('timeTracking.dialog')
  const editing = Boolean(entry)
  const [technicianId, setTechnicianId] = useState('')
  const [job, setJob] = useState<JobOption | null>(null)
  const [startedAt, setStartedAt] = useState('')
  const [endedAt, setEndedAt] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (entry) {
      setTechnicianId(entry.technicianId)
      setJob({
        id: entry.job.id,
        title: entry.job.title,
        status: entry.job.status,
        vehicleLabel: entry.job.vehicleLabel,
        licensePlate: entry.job.licensePlate,
      })
      setStartedAt(toWallClock(entry.startedAt, timeZone))
      setEndedAt(entry.endedAt ? toWallClock(entry.endedAt, timeZone) : '')
      setNote(entry.note ?? '')
    } else {
      setTechnicianId(defaults?.technicianId ?? technicians[0]?.id ?? '')
      setJob(null)
      const day = defaults?.dayKey ?? toWallClock(new Date().toISOString(), timeZone).slice(0, 10)
      setStartedAt(`${day}T08:00`)
      setEndedAt(`${day}T16:00`)
      setNote('')
    }
  }, [open, entry, defaults, technicians, timeZone])

  const duration = useMemo(() => {
    if (!startedAt || !endedAt) return null
    const a = new Date(startedAt)
    const b = new Date(endedAt)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
    // Both parsed in the browser's zone, which cancels out for a difference.
    return minutesBetween(a, b)
  }, [startedAt, endedAt])

  const wasRunning = entry ? !entry.endedAt : false
  const endInvalid = duration !== null && duration <= 0
  const canSave =
    !saving &&
    startedAt !== '' &&
    (editing ? entry !== null : technicianId !== '' && job !== null) &&
    (wasRunning ? endedAt === '' || !endInvalid : endedAt !== '' && !endInvalid)

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const result = editing
        ? await updateTimeEntry({
            id: (entry as SheetEntry).id,
            startedAt,
            endedAt: endedAt || null,
            note,
          })
        : await createTimeEntry({
            technicianId,
            serviceRecordId: (job as JobOption).id,
            startedAt,
            endedAt,
            note,
          })
      if (!result.success || !result.data) {
        toast.error(result.error || t('saveFailed'))
        return
      }
      toast.success(editing ? t('updated') : t('added'))
      onSaved(result.data)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t('editTitle') : t('addTitle')}</DialogTitle>
          <DialogDescription>
            {editing ? t('editDescription') : t('addDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="te-technician">{t('technician')}</Label>
            {editing ? (
              <Input id="te-technician" value={entry?.technicianName ?? ''} disabled />
            ) : (
              <Select value={technicianId} onValueChange={setTechnicianId}>
                <SelectTrigger id="te-technician" className="w-full">
                  <SelectValue placeholder={t('pickTechnician')} />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: tech.color }}
                        />
                        {tech.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>{t('job')}</Label>
            {editing ? (
              <Input value={jobLabel(job)} disabled />
            ) : (
              <JobPicker value={job} onChange={setJob} />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="te-start">{t('start')}</Label>
              <Input
                id="te-start"
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="te-end">{t('end')}</Label>
              <Input
                id="te-end"
                type="datetime-local"
                value={endedAt}
                min={startedAt || undefined}
                onChange={(e) => setEndedAt(e.target.value)}
                aria-invalid={endInvalid || undefined}
                placeholder={wasRunning ? t('stillRunning') : undefined}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {endInvalid
              ? t('endBeforeStart')
              : duration !== null
                ? t('duration', { duration: formatMinutes(duration) })
                : wasRunning
                  ? t('leaveEndEmpty')
                  : t('timesInWorkshopZone', { zone: timeZone })}
          </p>

          <div className="grid gap-1.5">
            <Label htmlFor="te-note">{t('note')}</Label>
            <Textarea
              id="te-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={t('notePlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSave}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {editing ? t('save') : t('add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function jobLabel(job: JobOption | null): string {
  if (!job) return ''
  const bits = [job.title, job.licensePlate ?? job.vehicleLabel].filter(Boolean)
  return bits.join(' · ')
}

/** Searches the workshop's jobs as the manager types; open jobs before a query. */
function JobPicker({
  value,
  onChange,
}: {
  value: JobOption | null
  onChange: (job: JobOption | null) => void
}) {
  const t = useTranslations('timeTracking.dialog')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<JobOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      const result = await searchTimesheetJobs(query)
      if (cancelled) return
      setOptions(result.success && result.data ? result.data : [])
      setLoading(false)
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value ? jobLabel(value) : t('pickJob')}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t('searchJobs')} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{loading ? t('searching') : t('noJobs')}</CommandEmpty>
            <CommandGroup>
              {options.map((job) => (
                <CommandItem
                  key={job.id}
                  value={job.id}
                  onSelect={() => {
                    onChange(job)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn('size-4', value?.id === job.id ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{job.title}</span>
                    {(job.licensePlate || job.vehicleLabel) && (
                      <span className="truncate text-xs text-muted-foreground">
                        {[job.licensePlate, job.vehicleLabel].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
