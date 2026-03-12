"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import {
  aiChat,
  listAiChats,
  loadAiChat,
  deleteAiChat,
  type ChatMessage,
  type ChatSummary,
} from "../Actions/aiChatActions";
import { cn } from "@/lib/utils";

const SUGGESTIONS_KEYS = [
  "suggestion1",
  "suggestion2",
  "suggestion3",
  "suggestion4",
] as const;

export function AiChatPage() {
  const t = useTranslations("aiChat");
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // Load chat list on mount
  useEffect(() => {
    loadChatList();
  }, []);

  const loadChatList = async () => {
    setLoadingChats(true);
    try {
      const result = await listAiChats();
      if (result.success && result.data) {
        setChats(result.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingChats(false);
    }
  };

  const handleNewChat = () => {
    setChatId(null);
    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
  };

  const handleSelectChat = async (id: string) => {
    if (id === chatId) return;
    try {
      const result = await loadAiChat(id);
      if (result.success && result.data) {
        setChatId(id);
        setMessages(result.data);
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteAiChat(id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (chatId === id) {
        handleNewChat();
      }
    } catch {
      // ignore
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text.trim() };
    const updated = [...messages, userMessage];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const result = await aiChat(chatId, updated);
      if (result.success && result.data) {
        const { content, chatId: returnedChatId } = result.data;
        setMessages([
          ...updated,
          { role: "assistant", content },
        ]);
        if (returnedChatId && returnedChatId !== chatId) {
          setChatId(returnedChatId);
        }
        // Refresh chat list to show new/updated chat
        loadChatList();
      } else {
        setMessages([
          ...updated,
          { role: "assistant", content: result.error || t("error") },
        ]);
      }
    } catch {
      setMessages([
        ...updated,
        { role: "assistant", content: t("error") },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r bg-muted/30">
        <div className="flex items-center gap-2 border-b p-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 justify-start gap-2"
            onClick={handleNewChat}
          >
            <MessageSquarePlus className="h-4 w-4" />
            {t("newChat")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingChats ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : chats.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {t("noChats")}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 p-2">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectChat(chat.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleSelectChat(chat.id); }}
                  className={cn(
                    "group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    chat.id === chatId && "bg-accent"
                  )}
                >
                  <span className="flex-1 truncate">{chat.title}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteChat(chat.id, e)}
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    title={t("deleteChat")}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="rounded-full bg-primary/10 p-3">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">{t("title")}</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t("description")}
                </p>
              </div>
              <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => sendMessage(t(key))}
                    className="rounded-lg border bg-card p-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-4 pb-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <Card
                    className={cn(
                      "px-4 py-3",
                      msg.role === "user"
                        ? "max-w-[85%] bg-primary text-primary-foreground"
                        : "max-w-full bg-card"
                    )}
                  >
                    {msg.role === "user" ? (
                      <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                    ) : (
                      <div className="ai-markdown text-sm">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => (
                              <div className="overflow-x-auto">
                                <table>{children}</table>
                              </div>
                            ),
                            a: ({ href, children }) => {
                              if (href?.startsWith("/")) {
                                return (
                                  <a
                                    href={href}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      router.push(href);
                                    }}
                                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                                  >
                                    {children}
                                  </a>
                                );
                              }
                              return (
                                <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                                  {children}
                                </a>
                              );
                            },
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </Card>
                  {msg.role === "user" && (
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <Card className="bg-card px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t bg-background p-4">
          <div className="mx-auto flex max-w-5xl items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("placeholder")}
              rows={1}
              className="min-h-[44px] max-h-32 resize-none"
              disabled={loading}
            />
            <Button
              type="button"
              size="icon"
              className="shrink-0"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
