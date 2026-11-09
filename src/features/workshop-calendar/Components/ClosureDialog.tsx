'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { createClosure, updateClosure, type ClosureView } from '../Actions/closureActions'
import {
  StretchFields,
  type StretchValue,
  stretchFromRow,
  stretchPayload,
  stretchProblem,
} from './StretchFields'

/** Add or edit one closed day (or stretch of days). */
export function ClosureDialog({
  open,
  onOpenChange,
  closure,
  defaultDate,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  closure?: ClosureView | null
  /** The day a new closure starts on. */
  defaultDate: string
  onSaved: () => void
}) {
  const t = useTranslations('workshopCalendar.closures')
  const tc = useTranslations('common')
  const [name, setName] = useState('')
  const [yearly, setYearly] = useState(false)
  const [stretch, setStretch] = useState<StretchValue>(() =>
    stretchFromRow({ startDate: defaultDate, endDate: defaultDate })
  )
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(closure?.name ?? '')
    setYearly(closure?.repeatsYearly ?? false)
    setStretch(stretchFromRow(closure ?? { startDate: defaultDate, endDate: defaultDate }))
    setTried(false)
  }, [open, closure, defaultDate])

  const nameMissing = !name.trim()
  const problem = stretchProblem(stretch)

  const save = async () => {
    setTried(true)
    if (nameMissing || problem) return
    setSaving(true)
    const payload = { name: name.trim(), repeatsYearly: yearly, ...stretchPayload(stretch) }
    const res = closure
      ? await updateClosure({ id: closure.id, ...payload })
      : await createClosure(payload)
    setSaving(false)
    if (!res.success) {
      toast.error(res.error ?? tc('errors.unexpected'))
      return
    }
    toast.success(t('saved'))
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{closure ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="closure-name">{t('name')}</Label>
            <Input
              id="closure-name"
              value={name}
              maxLength={80}
              placeholder={t('namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={tried && nameMissing}
            />
            {tried && nameMissing && (
              <p role="alert" className="text-sm text-destructive">
                {t('nameRequired')}
              </p>
            )}
          </div>
          <StretchFields idPrefix="closure" value={stretch} onChange={setStretch} />
          <label className="flex items-start gap-2 text-sm">
            <Switch checked={yearly} onCheckedChange={setYearly} className="mt-0.5" />
            <span>
              <span className="font-medium">{t('yearly')}</span>
              <span className="block text-xs text-muted-foreground">{t('yearlyHint')}</span>
            </span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('buttons.cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tc('buttons.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
