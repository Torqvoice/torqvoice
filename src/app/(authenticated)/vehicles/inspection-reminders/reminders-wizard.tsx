'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, RefreshCw, Send, Sparkles } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  type ReminderPreview,
  createInspectionReminderCampaign,
  previewInspectionReminders,
  sendTestInspectionReminder,
} from '@/features/inspection-reminders/Actions/inspectionReminderActions'
import type { ReminderChannel } from '@/features/inspection-reminders/Lib/candidates'
import { PLACEHOLDER_TOKENS } from '@/features/inspection-reminders/Lib/template'
import { useFormatDate } from '@/lib/use-format-date'

type Window = 30 | 60 | 90

/** Vehicle and customer, each a link, in a new tab so the reviewed list stays where it is. */
function CandidateLinks({
  vehicleId,
  vehicle,
  licensePlate,
  customerId,
  customerName,
}: {
  vehicleId: string
  vehicle: string
  licensePlate: string | null
  customerId: string | null
  customerName: string | null
}) {
  return (
    <span className="min-w-0 flex-1 truncate">
      <Link
        href={`/vehicles/${vehicleId}`}
        target="_blank"
        className="font-medium underline-offset-4 hover:underline"
      >
        {vehicle}
      </Link>
      {licensePlate && (
        <span className="ml-2 font-mono text-xs text-muted-foreground">{licensePlate}</span>
      )}
      {customerId && customerName ? (
        <Link
          href={`/customers/${customerId}`}
          target="_blank"
          className="ml-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {customerName}
        </Link>
      ) : customerName ? (
        <span className="ml-2 text-muted-foreground">{customerName}</span>
      ) : null}
    </span>
  )
}

function newToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Preview, review, confirm. The list is built fresh on every change, the
 * person unticks what should not go, sees the rendered message, and types
 * the number of recipients to send. One token per visit to the page, so a
 * second press of the button creates nothing new.
 */
export function RemindersWizard({
  initialWindow,
  initialChannel,
  initialPreview,
  error,
}: {
  initialWindow: Window
  initialChannel: ReminderChannel
  initialPreview: ReminderPreview | null
  error: string | null
}) {
  const t = useTranslations('vehicles.inspectionReminders')
  const { formatDate } = useFormatDate()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [windowDays, setWindowDays] = useState<Window>(initialWindow)
  const [channel, setChannel] = useState<ReminderChannel>(initialChannel)
  const [preview, setPreview] = useState<ReminderPreview | null>(initialPreview)
  const [subject, setSubject] = useState(initialPreview?.template.subject ?? '')
  const [body, setBody] = useState(initialPreview?.template.body ?? '')
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [sending, setSending] = useState(false)
  const [token] = useState(newToken)

  const includable = useMemo(
    () => (preview?.candidates ?? []).filter((c) => !c.excluded),
    [preview]
  )
  const excluded = useMemo(() => (preview?.candidates ?? []).filter((c) => c.excluded), [preview])
  const selected = includable.filter((c) => !deselected.has(c.vehicleId))

  const reload = (next: {
    windowDays?: Window
    channel?: ReminderChannel
    subject?: string
    body?: string
  }) => {
    const w = next.windowDays ?? windowDays
    const ch = next.channel ?? channel
    startTransition(async () => {
      const result = await previewInspectionReminders({
        windowDays: w,
        channel: ch,
        subject: next.subject ?? (ch === channel ? subject : undefined),
        body: next.body ?? (ch === channel ? body : undefined),
      })
      if (!result.success || !result.data) {
        toast.error(result.error ?? t('loadFailed'))
        return
      }
      setPreview(result.data)
      if (ch !== channel) {
        setSubject(result.data.template.subject)
        setBody(result.data.template.body)
      }
    })
  }

  const sendTest = async () => {
    const result = await sendTestInspectionReminder({ channel, subject, body })
    if (!result.success || !result.data) toast.error(result.error ?? t('testFailed'))
    else toast.success(t('testSent', { to: result.data.sentTo }))
  }

  const send = async () => {
    if (Number(typed) !== selected.length) return
    setSending(true)
    const result = await createInspectionReminderCampaign({
      idempotencyToken: token,
      windowDays,
      channel,
      subject: channel === 'email' ? subject : undefined,
      body,
      vehicleIds: selected.map((c) => c.vehicleId),
      confirmCount: selected.length,
    })
    setSending(false)
    if (!result.success || !result.data) {
      toast.error(result.error ?? t('sendFailed'))
      return
    }
    toast.success(t('created', { count: result.data.created }))
    router.push(`/vehicles/inspection-reminders/${result.data.campaignId}`)
  }

  if (error && !preview) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <AppCard title={t('title')} description={t('description')} contentClassName="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t('window')}</Label>
              <Select
                value={String(windowDays)}
                onValueChange={(v) => {
                  const w = Number(v) as Window
                  setWindowDays(w)
                  setDeselected(new Set())
                  reload({ windowDays: w })
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">{t('window30')}</SelectItem>
                  <SelectItem value="60">{t('window60')}</SelectItem>
                  <SelectItem value="90">{t('window90')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('channel')}</Label>
              <Select
                value={channel}
                onValueChange={(v) => {
                  const ch = v as ReminderChannel
                  setChannel(ch)
                  setDeselected(new Set())
                  reload({ channel: ch })
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(preview?.channels ?? [channel]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`channels.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={() => reload({})}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t('refresh')}
            </Button>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span>
                <Badge variant="secondary">{selected.length}</Badge> {t('willReceive')}
              </span>
              <span className="text-muted-foreground">
                {t('excludedCount', { count: excluded.length })}
              </span>
            </div>
          </div>

          {includable.length === 0 ? (
            <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              {t('nobodyToRemind')}
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {includable.map((c) => {
                const on = !deselected.has(c.vehicleId)
                return (
                  <label
                    key={c.vehicleId}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) => {
                        const next = new Set(deselected)
                        if (v) next.delete(c.vehicleId)
                        else next.add(c.vehicleId)
                        setDeselected(next)
                      }}
                    />
                    <CandidateLinks
                      vehicleId={c.vehicleId}
                      vehicle={c.vehicle}
                      licensePlate={c.licensePlate}
                      customerId={c.customerId}
                      customerName={c.customerName}
                    />
                    <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                      {c.recipient}
                    </span>
                    <span
                      className={`shrink-0 text-xs ${c.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
                    >
                      {c.overdue
                        ? t('overdueOn', { date: formatDate(c.dueAt) })
                        : formatDate(c.dueAt)}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </AppCard>

        {excluded.length > 0 && (
          <AppCard
            title={t('excludedTitle')}
            description={t('excludedDescription')}
            contentClassName="p-0"
          >
            <div className="divide-y">
              {excluded.map((c) => (
                <div key={c.vehicleId} className="flex items-center gap-3 px-5 py-2 text-sm">
                  <CandidateLinks
                    vehicleId={c.vehicleId}
                    vehicle={c.vehicle}
                    licensePlate={c.licensePlate}
                    customerId={c.customerId}
                    customerName={c.customerName}
                  />
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {t(`reasons.${c.excluded}`)}
                    {c.lastRemindedAt &&
                    (c.excluded === 'alreadyReminded' || c.excluded === 'cooldown')
                      ? ` · ${formatDate(c.lastRemindedAt)}`
                      : ''}
                  </Badge>
                </div>
              ))}
            </div>
          </AppCard>
        )}
      </div>

      <div className="space-y-4">
        <AppCard title={t('message')} contentClassName="space-y-3">
          {channel === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="ir-subject">{t('subject')}</Label>
              <Input
                id="ir-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onBlur={() => reload({ subject })}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ir-body">{t('body')}</Label>
            <Textarea
              id="ir-body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onBlur={() => reload({ body })}
            />
            <p className="text-xs text-muted-foreground">{t('placeholders', PLACEHOLDER_TOKENS)}</p>
          </div>
          {preview && preview.unknownPlaceholders.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('unknownPlaceholders', { list: preview.unknownPlaceholders.join(', ') })}
            </p>
          )}
          {preview?.sample && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t('sample')}
                {channel !== 'email' && ` · ${t('segments', { count: preview.sample.segments })}`}
              </p>
              {preview.sample.subject && <p className="font-medium">{preview.sample.subject}</p>}
              <p className="whitespace-pre-wrap">{preview.sample.body}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {preview?.settings.bookingMode === 'request'
              ? t('bookingModeRequestNote')
              : t('bookingModeDirectNote', {
                  minutes: preview?.settings.durationMinutes ?? 60,
                })}{' '}
            {t('linkValidNote', { days: preview?.settings.linkValidDays ?? 7 })}
          </p>
          {preview?.settings.timeZoneDetected && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                {t('timeZoneRequired', { zone: preview.settings.timeZone })}{' '}
                <Link href="/settings/localization" className="underline underline-offset-4">
                  {t('timeZoneRequiredLink')}
                </Link>
              </span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={sendTest}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {t('sendTest')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                selected.length === 0 || pending || (preview?.unknownPlaceholders.length ?? 0) > 0
              }
              onClick={() => {
                setTyped('')
                setConfirmOpen(true)
              }}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {t('sendButton', { count: selected.length })}
            </Button>
          </div>
        </AppCard>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('confirmDescription', {
                count: selected.length,
                channel: t(`channels.${channel}`),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ir-typed">{t('confirmInput', { count: selected.length })}</Label>
            <Input
              id="ir-typed"
              inputMode="numeric"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>
              {t('cancel')}
            </Button>
            <Button onClick={send} disabled={sending || Number(typed) !== selected.length}>
              {sending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t('sendNow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
