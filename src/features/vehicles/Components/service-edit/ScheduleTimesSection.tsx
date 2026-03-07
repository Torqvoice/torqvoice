'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Clock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { DateTimePicker } from '@/components/ui/datetime-picker'
import {
  getAssignmentForServiceRecord,
  createBoardAssignment,
  updateServiceTimes,
} from '@/features/workboard/Actions/boardActions'
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
}

export function ScheduleTimesSection({
  serviceRecordId,
  technicians = [],
  initialStartDateTime,
  initialEndDateTime,
}: ScheduleTimesSectionProps) {
  const t = useTranslations('service.schedule')
  const [loading, setLoading] = useState(true)
  const [assignedTech, setAssignedTech] = useState<{ id: string; name: string } | null>(null)

  const [startDateTime, setStartDateTime] = useState<Date | undefined>(
    initialStartDateTime ? new Date(initialStartDateTime) : new Date(),
  )
  const [endDateTime, setEndDateTime] = useState<Date | undefined>(
    initialEndDateTime ? new Date(initialEndDateTime) : new Date(Date.now() + 3600000),
  )

  const [selectedTechId, setSelectedTechId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    getAssignmentForServiceRecord(serviceRecordId)
      .then((res) => {
        setLoading(false)
        if (res.success && res.data) {
          setAssignedTech(res.data.technician)
        }
      })
      .catch(() => setLoading(false))
  }, [serviceRecordId])

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
    if (!res.success) {
      toast.error(res.error || t('failedUpdate'))
    }
  }

  const handlePreset = (hours: number) => {
    if (!startDateTime) return
    const newEnd = new Date(startDateTime.getTime() + hours * 3600000)
    setEndDateTime(newEnd)
    saveTimes(startDateTime, newEnd)
  }

  const handleCreate = async () => {
    if (!selectedTechId) return
    setCreating(true)
    const res = await createBoardAssignment({
      technicianId: selectedTechId,
      serviceRecordId,
    })
    if (res.success && res.data) {
      const refetch = await getAssignmentForServiceRecord(serviceRecordId)
      if (refetch.success && refetch.data) {
        setAssignedTech(refetch.data.technician)
      }
      toast.success(t('assigned'))
    } else {
      toast.error(t('failedAssign'))
    }
    setCreating(false)
  }

  if (loading) return null

  const currentHours = startDateTime && endDateTime
    ? Math.round((endDateTime.getTime() - startDateTime.getTime()) / 3600000)
    : null

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t('title')}</h3>
      </div>

      {assignedTech ? (
        <div className="text-xs text-muted-foreground">{assignedTech.name}</div>
      ) : technicians.length > 0 ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('technician')}</Label>
            <Select value={selectedTechId} onValueChange={setSelectedTechId}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectTechnician')} />
              </SelectTrigger>
              <SelectContent>
                {technicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="w-full" disabled={!selectedTechId || creating} onClick={handleCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('assign')}
          </Button>
        </div>
      ) : null}

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
