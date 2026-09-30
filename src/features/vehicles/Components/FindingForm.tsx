'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGlassModal } from '@/components/glass-modal'
import { toast } from 'sonner'
import { createFinding, updateFinding } from '../Actions/findingActions'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { clearableInput } from '@/lib/clearable'

interface FindingData {
  id: string
  description: string
  severity: string
  status: string
  notes: string | null
  serviceRecordId?: string | null
  concernId?: string | null
}

interface FindingFormProps {
  vehicleId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  finding?: FindingData
  serviceRecordId?: string
  /** The concerns on this job, so a finding can say which one it answers. */
  concerns?: { id: string; description: string }[]
  /** The concern a new finding starts out answering, when it was added from that concern's row. */
  defaultConcernId?: string | null
}

export function FindingForm({
  vehicleId,
  open,
  onOpenChange,
  finding,
  serviceRecordId,
  concerns = [],
  defaultConcernId = null,
}: FindingFormProps) {
  const router = useRouter()
  const modal = useGlassModal()
  const t = useTranslations('vehicles.findings')
  const tc = useTranslations('common.buttons')
  const [loading, setLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('needs_work')
  const [notes, setNotes] = useState('')
  // 'none' rather than '' because Radix treats an empty value as unset.
  const [concernId, setConcernId] = useState('none')

  const isEdit = !!finding

  useEffect(() => {
    if (open && finding) {
      setDescription(finding.description)
      setSeverity(finding.severity)
      setNotes(finding.notes || '')
      setConcernId(finding.concernId || 'none')
    } else if (open) {
      setDescription('')
      setSeverity('needs_work')
      setNotes('')
      setConcernId(defaultConcernId || 'none')
    }
  }, [open, finding, defaultConcernId])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const payload = {
      vehicleId,
      description,
      severity: severity as 'needs_work' | 'monitor' | 'urgent',
      notes: clearableInput(notes, isEdit),
      serviceRecordId: serviceRecordId || undefined,
      concernId: concernId === 'none' ? null : concernId,
    }

    const result = isEdit
      ? await updateFinding({ ...payload, id: finding.id })
      : await createFinding(payload)

    if (result.success) {
      toast.success(isEdit ? t('findingUpdated') : t('findingCreated'))
      onOpenChange(false)
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('saveError'))
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTitle') : t('addTitle')}</DialogTitle>
        </DialogHeader>

        {/* min-w-0 all the way down: the dialog is a grid, and a grid item is
            as wide as its widest content unless told otherwise. A concern is a
            sentence, the select showing it does not wrap, and once a concern
            could be preselected the form grew wider than the dialog and half
            of it was clipped behind a scrollbar. */}
        <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="finding-description">{t('descriptionLabel')}</Label>
            <Input
              id="finding-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="finding-severity">{t('severityLabel')}</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger id="finding-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="urgent">{t('severity.urgent')}</SelectItem>
                <SelectItem value="needs_work">{t('severity.needs_work')}</SelectItem>
                <SelectItem value="monitor">{t('severity.monitor')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Which question this answers. Only on a job that has concerns:
              on a vehicle-level observation there is nothing to answer. */}
          {concerns.length > 0 && (
            <div className="min-w-0 space-y-2">
              <Label htmlFor="finding-concern">{t('concernLabel')}</Label>
              <Select value={concernId} onValueChange={setConcernId}>
                <SelectTrigger
                  id="finding-concern"
                  className="w-full min-w-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[min(28rem,calc(100vw-4rem))]">
                  <SelectItem value="none">{t('concernNone')}</SelectItem>
                  {concerns.map((concern) => (
                    <SelectItem key={concern.id} value={concern.id} className="whitespace-normal">
                      {concern.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="finding-notes">{t('notesLabel')}</Label>
            <Textarea
              id="finding-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? tc('saveChanges') : t('addTitle')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
