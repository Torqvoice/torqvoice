'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
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
import { cn } from '@/lib/utils'
import { Loader2, Mail, MessageSquare, Send, TriangleAlert } from 'lucide-react'
import { getMessageContext, messageCustomerAboutTireSet } from '../Actions/messageCustomerActions'
import { SMS_SOFT_LIMIT, interpolate, type TireMessageReason } from '../Lib/messageTemplates'

type Context = NonNullable<Awaited<ReturnType<typeof getMessageContext>>['data']>

const CHANNEL_ICONS = {
  email: Mail,
  sms: MessageSquare,
  telegram: Send,
} as const

/**
 * Telling the customer what the tech just found.
 *
 * Opens with the message already written, because the value is in it being
 * one tap from the reading rather than in the composing. The text stays
 * editable: every shop has its own voice and its own view on what it will
 * promise, and a fixed script would just be deleted and retyped.
 */
export function MessageCustomerDialog({
  open,
  onOpenChange,
  tireSetId,
  reason,
  variables,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tireSetId: string
  reason: TireMessageReason
  /** Merge values resolved by the caller, which already has the readings. */
  variables: Record<string, string>
}) {
  const t = useTranslations('tireHotel')
  const router = useRouter()
  const [context, setContext] = useState<Context | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [channel, setChannel] = useState<'email' | 'sms' | 'telegram'>('sms')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [recipient, setRecipient] = useState('')

  useEffect(() => {
    if (!open) {
      setContext(null)
      setRecipient('')
      return
    }
    let cancelled = false
    setLoading(true)
    getMessageContext(tireSetId).then((result) => {
      if (cancelled) return
      const data = result.success && result.data ? result.data : null
      setContext(data)

      const merged = { ...variables, shop_name: data?.shopName ?? '' }
      setSubject(interpolate(t(`messaging.subjects.${reason}`), merged))
      setBody(interpolate(t(`messaging.bodies.${reason}`), merged))

      // Open on a channel that can actually reach them, preferring the one a
      // customer is most likely to read quickly.
      const reachable = data?.channels.filter((c) => c.reachable) ?? []
      const preferred = (['sms', 'telegram', 'email'] as const).find((c) =>
        reachable.some((r) => r.channel === c)
      )
      if (preferred) setChannel(preferred)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, tireSetId, reason, variables, t])

  const channels = context?.channels ?? []
  const active = channels.find((c) => c.channel === channel)
  const needsRecipient = !!active && !active.reachable
  const overLimit = channel === 'sms' && body.length > SMS_SOFT_LIMIT

  const handleSend = async () => {
    setSending(true)
    const result = await messageCustomerAboutTireSet({
      tireSetId,
      channel,
      subject,
      body,
      recipient,
      reason,
    })
    setSending(false)
    if (!result.success) {
      toast.error(result.error ?? t('messaging.failed'))
      return
    }
    toast.success(t('messaging.sent'))
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('messaging.title')}</DialogTitle>
          <DialogDescription>
            {context?.customer
              ? t('messaging.description', { name: context.customer.name })
              : t('messaging.noCustomer')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !context?.customer ? (
          <p className="py-4 text-sm text-muted-foreground">{t('messaging.noCustomerBody')}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('messaging.channel')}</Label>
              <div className="flex flex-wrap gap-2">
                {channels.map(({ channel: value, reachable }) => {
                  const Icon = CHANNEL_ICONS[value as keyof typeof CHANNEL_ICONS]
                  const isOn = channel === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setChannel(value as 'email' | 'sms' | 'telegram')}
                      aria-pressed={isOn}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                        isOn
                          ? 'border-primary/40 bg-primary/10'
                          : 'text-muted-foreground hover:bg-muted/60'
                      )}
                    >
                      {Icon && <Icon className={cn('h-4 w-4', isOn && 'text-primary')} />}
                      {t(`messaging.channels.${value}`)}
                      {/* An address the workshop does not hold is a different
                          problem from a channel it has not configured, so the
                          row stays selectable and says which it is. */}
                      {!reachable && (
                        <span className="text-[10px] text-amber-600">
                          {t('messaging.noAddress')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {needsRecipient && (
              <div className="space-y-2">
                <Label htmlFor="tireMsgRecipient">{t('messaging.recipient')}</Label>
                <Input
                  id="tireMsgRecipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder={
                    channel === 'email' ? 'name@example.com' : t('messaging.recipientPlaceholder')
                  }
                />
              </div>
            )}

            {channel === 'email' && (
              <div className="space-y-2">
                <Label htmlFor="tireMsgSubject">{t('messaging.subject')}</Label>
                <Input
                  id="tireMsgSubject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="tireMsgBody">{t('messaging.message')}</Label>
                {channel === 'sms' && (
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      overLimit ? 'text-amber-600' : 'text-muted-foreground'
                    )}
                  >
                    {body.length}/{SMS_SOFT_LIMIT}
                  </span>
                )}
              </div>
              <Textarea
                id="tireMsgBody"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
              />
              {overLimit && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  {t('messaging.smsLong')}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              sending ||
              loading ||
              !context?.customer ||
              !body.trim() ||
              (needsRecipient && !recipient.trim())
            }
          >
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('messaging.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
