'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Bell, Loader2, Mail, MessageCircle, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DateInput } from '@/components/ui/date-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocsLink } from '@/components/docs-link'
import { CustomerCombobox } from '@/features/quotes/Components/CustomerCombobox'
import { createScheduledMessage, updateScheduledMessage } from '../Actions/scheduledMessageActions'
import {
  MESSAGE_FREQUENCIES,
  type MessageChannel,
  type MessageFrequency,
} from '../Schema/scheduledMessageSchema'

/** Roughly one SMS segment times ten; the provider splits anything longer. */
const SMS_MAX = 1600

export const CHANNEL_ICONS = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  telegram: Send,
  in_app: Bell,
} as const

export interface ScheduleMessageValues {
  id: string
  channel: string
  subject: string | null
  body: string
  recipient: string | null
  sendAt: Date
  frequency: string
  endDate: Date | null
  customer: { id: string; name: string } | null
}

interface ScheduleMessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Channels the workshop can actually send on right now */
  availableChannels: MessageChannel[]
  /** Set to edit an existing message; left out, the dialog schedules a new one */
  message?: ScheduleMessageValues
  /** YYYY-MM-DD the message goes out on, e.g. the calendar day that was right-clicked */
  defaultDate?: string
  defaultCustomer?: { id: string; name: string; company: string | null } | null
  /** Pre-filled text, e.g. a draft handed over from the compose dialog */
  defaultBody?: string
  onSaved?: () => void
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toTimeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ScheduleMessageDialog({
  open,
  onOpenChange,
  availableChannels,
  message,
  defaultDate,
  defaultCustomer = null,
  defaultBody,
  onSaved,
}: ScheduleMessageDialogProps) {
  const t = useTranslations('scheduledMessages.dialog')
  const tc = useTranslations('common.buttons')
  const isEdit = !!message

  const [channel, setChannel] = useState<MessageChannel>(availableChannels[0] ?? 'email')
  const [customerId, setCustomerId] = useState('')
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [frequency, setFrequency] = useState<MessageFrequency>('once')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  // Re-seed on every open so the day just picked wins over the last one
  useEffect(() => {
    if (!open) return
    if (message) {
      setChannel(message.channel as MessageChannel)
      setCustomerId(message.customer?.id ?? '')
      setRecipient(message.recipient ?? '')
      setSubject(message.subject ?? '')
      setBody(message.body)
      setDate(toLocalDateStr(message.sendAt))
      setTime(toTimeStr(message.sendAt))
      setFrequency(message.frequency as MessageFrequency)
      setEndDate(message.endDate ? toLocalDateStr(message.endDate) : '')
    } else {
      // A draft handed over from the SMS composer stays an SMS when possible
      setChannel(
        defaultBody && availableChannels.includes('sms') ? 'sms' : (availableChannels[0] ?? 'email')
      )
      setCustomerId(defaultCustomer?.id ?? '')
      setRecipient('')
      setSubject('')
      setBody(defaultBody ?? '')
      setDate(defaultDate ?? toLocalDateStr(new Date()))
      setTime('09:00')
      setFrequency('once')
      setEndDate('')
    }
  }, [open, message, defaultDate, defaultBody, defaultCustomer?.id, availableChannels])

  const needsRecipient = channel !== 'in_app' && !customerId
  const recipientLabel = useMemo(() => {
    if (channel === 'sms') return t('recipientPhone')
    if (channel === 'telegram') return t('recipientChat')
    return t('recipientEmail')
  }, [channel, t])

  const canSave =
    !!body.trim() &&
    !!date &&
    !!time &&
    (channel !== 'email' || !!subject.trim()) &&
    (!needsRecipient || !!recipient.trim())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)

    const payload = {
      channel,
      subject: subject.trim() || undefined,
      body: body.trim(),
      recipient: recipient.trim() || undefined,
      customerId: customerId || null,
      sendAt: `${date}T${time}`,
      frequency,
      endDate: frequency === 'once' || !endDate ? undefined : `${endDate}T${time}`,
    }

    const result = isEdit
      ? await updateScheduledMessage({
          ...payload,
          id: message.id,
          endDate: payload.endDate ?? null,
        })
      : await createScheduledMessage(payload)

    if (result.success) {
      toast.success(isEdit ? t('updated') : t('scheduled'))
      onOpenChange(false)
      onSaved?.()
    } else {
      toast.error(result.error || t('saveError'))
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTitle') : t('title')}</DialogTitle>
          <DocsLink href="/docs/features/messages" variant="hint" className="self-start" />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('channelLabel')}</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as MessageChannel)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableChannels.map((c) => {
                    const Icon = CHANNEL_ICONS[c]
                    return (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          {t(`channels.${c}`)}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('repeatLabel')}</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as MessageFrequency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESSAGE_FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(`frequencies.${f}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {channel !== 'in_app' && (
            <div className="space-y-2">
              <Label>{t('customerLabel')}</Label>
              <CustomerCombobox
                value={customerId}
                initialCustomer={customerId === defaultCustomer?.id ? defaultCustomer : null}
                placeholder={t('selectCustomer')}
                noneLabel={t('none')}
                onChange={(id) => setCustomerId(id)}
              />
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={customerId ? t('recipientOverride') : recipientLabel}
              />
              <p className="text-xs text-muted-foreground">
                {customerId ? t('recipientHintCustomer') : t('recipientHintDirect')}
              </p>
            </div>
          )}

          {channel === 'email' && (
            <div className="space-y-2">
              <Label htmlFor="scheduled-subject">{t('subjectLabel')}</Label>
              <Input
                id="scheduled-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('subjectPlaceholder')}
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="scheduled-body">{t('messageLabel')}</Label>
            <Textarea
              id="scheduled-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('messagePlaceholder')}
              rows={5}
              maxLength={channel === 'sms' ? SMS_MAX : undefined}
              required
            />
            {channel === 'sms' && (
              <p className="text-xs text-muted-foreground text-right tabular-nums">
                {t('characters', { count: body.length, max: SMS_MAX })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scheduled-date">{t('dateLabel')}</Label>
              <DateInput id="scheduled-date" value={date} onChange={setDate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduled-time">{t('timeLabel')}</Label>
              <Input
                id="scheduled-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>

          {frequency !== 'once' && (
            <div className="space-y-2">
              <Label htmlFor="scheduled-end">{t('endDateLabel')}</Label>
              <DateInput id="scheduled-end" value={endDate} onChange={setEndDate} />
              <p className="text-xs text-muted-foreground">{t('endDateHint')}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !canSave}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? tc('saveChanges') : t('schedule')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
