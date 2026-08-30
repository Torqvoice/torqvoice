'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowLeft, CalendarClock, Loader2, Phone, Search, Send, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocsLink } from '@/components/docs-link'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { searchSmsRecipients, sendSmsToCustomer } from '../Actions/smsActions'
import { SmsTemplateMenu } from './SmsTemplateMenu'

interface Recipient {
  id: string
  name: string
  company: string | null
  phone: string | null
}

/** GSM-7 segment sizes; a single message, then concatenated ones. */
const SINGLE_SEGMENT = 160
const MULTI_SEGMENT = 153

function segmentCount(length: number): number {
  if (length === 0) return 0
  if (length <= SINGLE_SEGMENT) return 1
  return Math.ceil(length / MULTI_SEGMENT)
}

interface NewSmsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselected recipient, e.g. the thread that is open */
  defaultRecipient?: Recipient | null
  /** Called with the customer id once a message is on its way */
  onSent?: (customerId: string) => void
  /** Hands the drafted text over to the scheduling dialog */
  onSchedule?: (recipient: Recipient | null, body: string) => void
}

export function NewSmsDialog({
  open,
  onOpenChange,
  defaultRecipient = null,
  onSent,
  onSchedule,
}: NewSmsDialogProps) {
  const t = useTranslations('messages.compose')
  const tc = useTranslations('common.buttons')

  const [recipient, setRecipient] = useState<Recipient | null>(defaultRecipient)
  const [results, setResults] = useState<Recipient[]>([])
  const [searching, setSearching] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const runSearch = useMemo(
    () => async (term: string | undefined) => {
      setSearching(true)
      const result = await searchSmsRecipients(term ?? undefined)
      if (result.success && result.data) setResults(result.data)
      setSearching(false)
    },
    []
  )

  const { value: search, setValue: setSearch } = useDebouncedSearch('', runSearch)

  // Re-seed on every open, and load the first page of recipients
  useEffect(() => {
    if (!open) return
    setRecipient(defaultRecipient)
    setBody('')
    setSearch('')
    runSearch('')
  }, [open, defaultRecipient, runSearch, setSearch])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recipient || !body.trim()) return
    setSending(true)

    const result = await sendSmsToCustomer({ customerId: recipient.id, body: body.trim() })

    if (result.success) {
      toast.success(t('sent', { name: recipient.name }))
      onOpenChange(false)
      onSent?.(recipient.id)
    } else {
      toast.error(result.error || t('sendError'))
    }
    setSending(false)
  }

  const chars = body.length
  const segments = segmentCount(chars)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DocsLink href="/docs/integrations/sms" variant="hint" className="self-start" />
        </DialogHeader>

        {!recipient ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="pl-9"
                autoFocus
              />
              {searching && (
                <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              {results.length === 0 ? (
                <div className="px-2 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {search ? t('noMatches') : t('noRecipients')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('noRecipientsHint')}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {results.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setRecipient(customer)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {customer.name}
                          {customer.company && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {customer.company}
                            </span>
                          )}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setRecipient(null)}
                aria-label={t('changeRecipient')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{recipient.name}</p>
                <p className="text-xs text-muted-foreground">{recipient.phone}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="new-sms-body">{t('messageLabel')}</Label>
                <SmsTemplateMenu
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onPick={(template) =>
                    setBody((current) => (current ? `${current}\n${template}` : template))
                  }
                />
              </div>
              <Textarea
                id="new-sms-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('messagePlaceholder', { name: recipient.name })}
                rows={5}
                autoFocus
                required
              />
              <p className="text-right text-xs text-muted-foreground tabular-nums">
                {t('segments', { chars, segments })}
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {tc('cancel')}
              </Button>
              {onSchedule && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false)
                    onSchedule(recipient, body.trim())
                  }}
                >
                  <CalendarClock className="mr-2 h-4 w-4" />
                  {t('scheduleInstead')}
                </Button>
              )}
              <Button type="submit" disabled={sending || !body.trim()}>
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {t('send')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
