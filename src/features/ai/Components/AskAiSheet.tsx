'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  History,
  Loader2,
  Lock,
  MessageSquarePlus,
  Send,
  Sparkles,
  Square,
  Trash2,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { AskAiSubject } from '../Lib/askAiContext'
import type { AskAiStreamEvent } from '../Schema/aiChatSchema'
import {
  type ChatMessage,
  type ChatSummary,
  deleteAskAiChat,
  listAskAiChats,
  loadAskAiChat,
} from '../Actions/aiChatActions'

const SUGGESTIONS = {
  vehicle: ['vehicleSuggestion1', 'vehicleSuggestion2', 'vehicleSuggestion3', 'vehicleSuggestion4'],
  customer: [
    'customerSuggestion1',
    'customerSuggestion2',
    'customerSuggestion3',
    'customerSuggestion4',
  ],
} as const

interface Bubble extends ChatMessage {
  /** An answer that never arrived; shown in the assistant's place, not saved. */
  failed?: boolean
}

/**
 * "Ask AI" for one vehicle or one customer: a button that opens a side
 * sheet with a chat about that record and nothing else. Answers stream in
 * from /api/protected/ai/chat; earlier chats about the same record are
 * listed under the history button.
 */
export function AskAiSheet({
  subject,
  title,
  className,
}: {
  subject: AskAiSubject
  /** The record's name, shown under the sheet title and used to start the chat. */
  title: string
  className?: string
}) {
  const t = useTranslations('aiChat')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Bubble[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [chatId, setChatId] = useState<string | null>(null)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const subjectKey = `${subject.type}:${subject.id}`

  const refreshChats = useCallback(async () => {
    const result = await listAskAiChats(subject)
    if (result.success && result.data) setChats(result.data)
  }, [subjectKey])

  useEffect(() => {
    if (!open) return
    refreshChats()
    const id = window.setTimeout(() => textareaRef.current?.focus(), 150)
    return () => window.clearTimeout(id)
  }, [open, refreshChats])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Closing the sheet mid-answer stops the request; nothing is saved then.
  useEffect(() => {
    if (!open) abortRef.current?.abort()
  }, [open])

  const startNewChat = () => {
    abortRef.current?.abort()
    setChatId(null)
    setMessages([])
    setInput('')
    textareaRef.current?.focus()
  }

  const openChat = async (id: string) => {
    if (id === chatId || streaming) return
    const result = await loadAskAiChat(id, subject)
    if (result.success && result.data) {
      setChatId(id)
      setMessages(result.data)
    }
  }

  const removeChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    await deleteAskAiChat(id)
    setChats((prev) => prev.filter((c) => c.id !== id))
    if (chatId === id) startNewChat()
  }

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || streaming) return

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '' },
    ])
    setInput('')
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller

    const patchAnswer = (update: (current: Bubble) => Bubble) =>
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') next[next.length - 1] = update(last)
        return next
      })
    const fail = (message: string) =>
      patchAnswer((b) => ({ ...b, content: b.content || message, failed: true }))

    try {
      const res = await fetch('/api/protected/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, chatId, message: question }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        fail(data?.error || t('error'))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let savedTo: string | null = null
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          let event: AskAiStreamEvent
          try {
            event = JSON.parse(line) as AskAiStreamEvent
          } catch {
            continue
          }
          if (event.t === 'delta') {
            patchAnswer((b) => ({ ...b, content: b.content + event.d }))
          } else if (event.t === 'chat') {
            savedTo = event.id
          } else if (event.t === 'error') {
            fail(event.m)
          }
        }
      }
      if (savedTo) {
        if (savedTo !== chatId) setChatId(savedTo)
        refreshChats()
      }
    } catch (err) {
      if (controller.signal.aborted) {
        patchAnswer((b) => ({ ...b, content: b.content || t('stopped'), failed: !b.content }))
      } else {
        console.error('[ask-ai]', err)
        fail(t('error'))
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setStreaming(false)
      textareaRef.current?.focus()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-1.5', className)}>
          <Sparkles className="h-3.5 w-3.5" />
          {t('askAi')}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('title')}
              </SheetTitle>
              <SheetDescription className="truncate">
                {t(subject.type === 'vehicle' ? 'aboutVehicle' : 'aboutCustomer', { name: title })}
              </SheetDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('history')}>
                    <History className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    {t('chatsPrivate')}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {chats.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                      {t('noChats')}
                    </div>
                  ) : (
                    chats.map((chat) => (
                      <DropdownMenuItem
                        key={chat.id}
                        onSelect={() => openChat(chat.id)}
                        className={cn('group gap-2', chat.id === chatId && 'bg-accent')}
                      >
                        <span className="flex-1 truncate">{chat.title}</span>
                        <button
                          type="button"
                          onClick={(e) => removeChat(chat.id, e)}
                          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
                          aria-label={t('deleteChat')}
                          title={t('deleteChat')}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={startNewChat}
                aria-label={t('newChat')}
                title={t('newChat')}
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-5">
              <div className="rounded-full bg-primary/10 p-3">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <div className="grid w-full gap-2">
                {SUGGESTIONS[subject.type].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => send(t(key))}
                    className="rounded-lg border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-2">
              {messages.map((msg, i) => (
                <div key={i} className={cn('flex gap-2.5', msg.role === 'user' && 'justify-end')}>
                  {msg.role === 'assistant' && (
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Sparkles className="h-3 w-3 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm',
                      msg.role === 'user'
                        ? 'max-w-[85%] whitespace-pre-wrap bg-primary text-primary-foreground'
                        : 'min-w-0 max-w-full bg-muted/60',
                      msg.failed && 'border border-destructive/40 text-destructive'
                    )}
                  >
                    {msg.role === 'user' ? (
                      msg.content
                    ) : msg.content ? (
                      <div className="ai-markdown">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => (
                              <div className="overflow-x-auto">
                                <table>{children}</table>
                              </div>
                            ),
                            a: ({ href, children }) =>
                              href?.startsWith('/') ? (
                                <a
                                  href={href}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    setOpen(false)
                                    router.push(href)
                                  }}
                                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                                >
                                  {children}
                                </a>
                              ) : (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline underline-offset-2"
                                >
                                  {children}
                                </a>
                              ),
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                      <User className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-background p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('placeholder')}
              rows={1}
              className="max-h-32 min-h-[40px] resize-none"
              disabled={streaming}
            />
            {streaming ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="shrink-0"
                onClick={() => abortRef.current?.abort()}
                aria-label={t('stop')}
                title={t('stop')}
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="shrink-0"
                onClick={() => send(input)}
                disabled={!input.trim()}
                aria-label={t('send')}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t('disclaimer')}</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
