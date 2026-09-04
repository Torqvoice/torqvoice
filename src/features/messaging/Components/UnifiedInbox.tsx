'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  ChevronDown,
  Inbox,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { deleteConversation, getConversation } from '@/features/sms/Actions/smsActions'
import {
  deleteTelegramConversation,
  getTelegramConversation,
} from '@/features/telegram/Actions/telegramActions'
import { SmsConversation } from '@/features/sms/Components/SmsConversation'
import { NewSmsDialog } from '@/features/sms/Components/NewSmsDialog'
import { TelegramConversation } from '@/features/telegram/Components/TelegramConversation'
import { WhatsappConversation } from '@/features/whatsapp/Components/WhatsappConversation'
import { NewWhatsappDialog } from '@/features/whatsapp/Components/NewWhatsappDialog'
import {
  deleteWhatsappConversation,
  deleteWhatsappConversationByPhone,
} from '@/features/whatsapp/Actions/whatsappActions'
import {
  getInboxThreads,
  markThreadRead,
  type InboxThread,
  type MessagingChannel,
} from '../Actions/inboxActions'
import { ChannelBadge, channelLabel } from './ChannelBadge'
import { avatarTint, initials } from '../Lib/threadDisplay'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

/**
 * Every conversation, whatever it arrived on.
 *
 * A workshop has one relationship with a customer and several ways of reaching
 * them, so the list is one and the channel is a badge on the row. Replies go
 * back out on the channel the thread is on, which is why each row keeps its
 * own conversation component rather than sharing a compose box.
 */

/** Channels a workshop can start a conversation on. */
const INITIABLE: MessagingChannel[] = ['sms', 'whatsapp']

/**
 * Taken from what the actions actually return rather than declared here.
 * Hand-written shapes plus a cast let this drift: the pane read a name and a
 * phone number the action never sent, so an SMS thread claimed the customer
 * had no number at all.
 */
type SmsConversationData = NonNullable<Awaited<ReturnType<typeof getConversation>>['data']>
type TelegramConversationData = NonNullable<
  Awaited<ReturnType<typeof getTelegramConversation>>['data']
>

export function UnifiedInbox({
  threads: initialThreads,
  initialCursor = null,
  channels,
  onChanged,
}: {
  threads: InboxThread[]
  /** Where the next page starts, or null when the first page is all of it. */
  initialCursor?: string | null
  channels: MessagingChannel[]
  /** Asks the page to reload its server data after something is sent. */
  onChanged?: () => void
}) {
  const t = useTranslations('messaging.inbox')
  const router = useRouter()
  const [threads, setThreads] = useState(initialThreads)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [selected, setSelected] = useState<InboxThread | null>(null)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [smsData, setSmsData] = useState<SmsConversationData | null>(null)
  const [telegramData, setTelegramData] = useState<TelegramConversationData | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<InboxThread | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showChannelChoice, setShowChannelChoice] = useState(false)
  const [composeChannel, setComposeChannel] = useState<MessagingChannel | null>(null)

  // Search runs on the server: filtering only what is loaded would quietly
  // answer "no results" for a conversation two pages down.
  const runSearch = useCallback(async (term?: string) => {
    setLoadingMore(true)
    const result = await getInboxThreads({ search: term })
    if (result.success && result.data) {
      setThreads(result.data.threads)
      setCursor(result.data.nextCursor)
    }
    setLoadingMore(false)
  }, [])

  const { value: search, setValue: setSearch } = useDebouncedSearch('', runSearch)

  // A send or a delete reloads the page's data; adopt it and start again.
  useEffect(() => {
    if (search.trim()) return
    setThreads(initialThreads)
    setCursor(initialCursor)
  }, [initialThreads, initialCursor, search])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    const result = await getInboxThreads({ cursor, search: search.trim() || undefined })
    if (result.success && result.data) {
      const page = result.data
      setThreads((previous) => {
        const seen = new Set(previous.map((thread) => thread.key))
        return [...previous, ...page.threads.filter((thread) => !seen.has(thread.key))]
      })
      setCursor(page.nextCursor)
    }
    setLoadingMore(false)
  }, [cursor, loadingMore, search])

  // Continuous scroll: the button below stays for keyboards and for the case
  // where the observer never fires.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !cursor) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [cursor, loadMore])

  const visibleThreads = threads

  /**
   * Opening a thread is reading it. The row loses its marker at once, the
   * server is told, and the layout is refreshed so the sidebar pill follows.
   */
  const markRead = useCallback(
    async (thread: InboxThread) => {
      if (thread.unread === 0) return
      setThreads((previous) =>
        previous.map((row) => (row.key === thread.key ? { ...row, unread: 0 } : row))
      )
      const result = await markThreadRead({
        channel: thread.channel,
        customerId: thread.customerId,
        contact: thread.contact,
      })
      if (result.success && result.data && result.data.marked > 0) router.refresh()
    },
    [router]
  )

  /** SMS and Telegram hand their history over as props, so it loads on select. */
  const select = useCallback(
    async (thread: InboxThread) => {
      setSelected(thread)
      setSmsData(null)
      setTelegramData(null)
      void markRead(thread)
      if (!thread.customerId) return

      if (thread.channel === 'sms') {
        setLoadingConversation(true)
        const result = await getConversation(thread.customerId)
        if (result.success && result.data) setSmsData(result.data)
        setLoadingConversation(false)
      } else if (thread.channel === 'telegram') {
        setLoadingConversation(true)
        const result = await getTelegramConversation(thread.customerId)
        if (result.success && result.data) setTelegramData(result.data)
        setLoadingConversation(false)
      }
    },
    [markRead]
  )

  /** Removes our copy of a conversation; the customer's phone keeps theirs. */
  const confirmDelete = async () => {
    const thread = deleteTarget
    if (!thread) return
    setIsDeleting(true)

    // A WhatsApp thread can exist under a bare number, and those are the ones
    // most worth clearing away: test sends and wrong numbers.
    const result = !thread.customerId
      ? await deleteWhatsappConversationByPhone(thread.contact)
      : thread.channel === 'sms'
        ? await deleteConversation(thread.customerId)
        : thread.channel === 'telegram'
          ? await deleteTelegramConversation(thread.customerId)
          : await deleteWhatsappConversation(thread.customerId)

    setIsDeleting(false)
    setDeleteTarget(null)

    if (result.success) {
      if (selected?.key === thread.key) setSelected(null)
      onChanged?.()
    } else {
      toast.error(result.error ?? t('deleteFailed'))
    }
  }

  const startCompose = () => {
    const options = channels.filter((channel) => INITIABLE.includes(channel))
    if (options.length === 1) {
      setComposeChannel(options[0])
      return
    }
    setShowChannelChoice(true)
  }

  const openThreadFor = (
    channel: MessagingChannel,
    customer: { id: string; name: string; phone?: string | null }
  ) => {
    const existing = threads.find(
      (thread) => thread.channel === channel && thread.customerId === customer.id
    )
    select(
      existing ?? {
        key: `${channel}:${customer.id}`,
        channel,
        customerId: customer.id,
        name: customer.name,
        contact: customer.phone ?? '',
        lastMessage: '',
        lastDirection: 'outbound',
        lastAt: new Date(0).toISOString(),
        unread: 0,
      }
    )
  }

  const composeOptions = channels.filter((channel) => INITIABLE.includes(channel))

  return (
    <>
      {/* Thread list — full width on mobile, hidden when a conversation is open */}
      <div
        className={cn(
          'flex w-full shrink-0 flex-col sm:w-80 sm:border-r',
          selected ? 'hidden sm:flex' : 'flex'
        )}
      >
        <div className="shrink-0 space-y-2 border-b px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{t('title')}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{threads.length}</span>
            </div>
            {/* Starting a conversation used to be offered only by the empty
                state, so it disappeared as soon as there was anything to read. */}
            {composeOptions.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={startCompose}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t('newMessage')}
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12">
              <Inbox className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-center text-sm text-muted-foreground">
                {search ? t('noSearchResults') : t('empty')}
              </p>
              {!search && composeOptions.length > 0 && (
                <Button size="sm" variant="outline" className="mt-3" onClick={startCompose}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {t('newMessage')}
                </Button>
              )}
            </div>
          ) : (
            visibleThreads.map((thread) => {
              const isInbound = thread.lastDirection === 'inbound'
              const isUnread = thread.unread > 0
              return (
                <button
                  key={thread.key}
                  type="button"
                  onClick={() => select(thread)}
                  className={cn(
                    'w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                    selected?.key === thread.key && 'bg-muted'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        avatarTint(thread.customerId ?? thread.contact)
                      )}
                    >
                      {initials(thread.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-sm',
                            isUnread ? 'font-semibold' : 'font-medium'
                          )}
                        >
                          {thread.name}
                        </span>
                        <ChannelBadge channel={thread.channel} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p
                          className={cn(
                            'min-w-0 flex-1 truncate text-xs',
                            isInbound ? 'text-foreground' : 'text-muted-foreground',
                            isUnread && 'font-medium'
                          )}
                        >
                          {thread.lastMessage}
                        </p>
                        {/* Waiting messages get a primary dot; the count is
                            on the sidebar, where it sums every thread. */}
                        {isUnread && (
                          <span
                            aria-label={t('unread', { count: thread.unread })}
                            className="size-2 shrink-0 rounded-full bg-primary"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}

          {cursor && (
            <div ref={sentinelRef} className="p-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronDown className="mr-2 h-3.5 w-3.5" />
                )}
                {t('loadMore')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Conversation pane */}
      <div className={cn('flex min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden sm:flex')}>
        {selected ? (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 sm:hidden"
                onClick={() => setSelected(null)}
                aria-label={t('back')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{selected.name}</span>
                  <ChannelBadge channel={selected.channel} withIcon />
                </div>
                <p className="truncate text-xs text-muted-foreground">{selected.contact}</p>
              </div>
              {(selected.customerId || selected.channel === 'whatsapp') && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteTarget(selected)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('deleteConversation')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {loadingConversation ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : selected.channel === 'whatsapp' ? (
              <WhatsappConversation
                key={selected.key}
                thread={{
                  key: selected.key,
                  customerId: selected.customerId,
                  name: selected.name,
                  phone: selected.contact,
                }}
                onSent={onChanged}
                className="h-auto min-h-0 flex-1"
              />
            ) : selected.channel === 'sms' && smsData && selected.customerId ? (
              <SmsConversation
                key={selected.key}
                customerId={selected.customerId}
                customerName={smsData.customerName}
                customerPhone={smsData.customerPhone}
                initialMessages={smsData.messages}
                initialNextCursor={smsData.nextCursor}
                className="h-auto min-h-0 flex-1"
              />
            ) : selected.channel === 'telegram' && telegramData && selected.customerId ? (
              <TelegramConversation
                key={selected.key}
                customerId={selected.customerId}
                customerName={telegramData.customerName}
                telegramChatId={telegramData.telegramChatId}
                initialMessages={telegramData.messages}
                initialNextCursor={telegramData.nextCursor}
                className="h-auto min-h-0 flex-1"
              />
            ) : (
              <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                {t('unknownContact')}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <Inbox className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm">{t('selectConversation')}</p>
            {composeOptions.length > 0 && (
              <Button size="sm" variant="outline" className="mt-3" onClick={startCompose}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t('newMessage')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Which channel, asked only when there is a choice to make */}
      <Dialog open={showChannelChoice} onOpenChange={setShowChannelChoice}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('chooseChannel.title')}</DialogTitle>
            <DialogDescription>{t('chooseChannel.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {composeOptions.map((channel) => (
              <Button
                key={channel}
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setShowChannelChoice(false)
                  setComposeChannel(channel)
                }}
              >
                <ChannelBadge channel={channel} withIcon className="mr-2" />
                {channelLabel(channel)}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDescription', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NewSmsDialog
        open={composeChannel === 'sms'}
        onOpenChange={(open) => !open && setComposeChannel(null)}
        onSent={(customerId) => {
          onChanged?.()
          const thread = threads.find((t) => t.channel === 'sms' && t.customerId === customerId)
          if (thread) select(thread)
        }}
      />

      <NewWhatsappDialog
        open={composeChannel === 'whatsapp'}
        onOpenChange={(open) => !open && setComposeChannel(null)}
        onSelect={(recipient) => openThreadFor('whatsapp', recipient)}
      />
    </>
  )
}
