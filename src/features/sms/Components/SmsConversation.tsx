"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageSquare, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendSmsToCustomer, getConversation } from "../Actions/smsActions";
import { useNotificationStore } from "@/features/notifications/store/notificationStore";
import { setActiveSmsCustomerId } from "../activeSmsView";
import { toast } from "sonner";

interface Message {
  id: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string | Date;
  fromNumber: string;
  toNumber: string;
}

interface SmsConversationProps {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  initialMessages: Message[];
  initialNextCursor: string | null;
}

export function SmsConversation({
  customerId,
  customerName,
  customerPhone,
  initialMessages,
  initialNextCursor,
}: SmsConversationProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [newMessage, setNewMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [isSending, startSend] = useTransition();
  const [isLoadingMore, startLoadMore] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveSmsCustomerId(customerId);
    return () => setActiveSmsCustomerId(null);
  }, [customerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Refetch conversation when a matching inbound SMS notification arrives via WS
  const refreshConversation = useCallback(async () => {
    const conv = await getConversation(customerId);
    if (conv.success && conv.data) {
      setMessages(conv.data.messages.map((m) => ({
        ...m,
        createdAt: typeof m.createdAt === "string" ? m.createdAt : m.createdAt.toISOString(),
      })));
      setNextCursor(conv.data.nextCursor);
    }
  }, [customerId]);

  useEffect(() => {
    // Track the last notification count so we only react to new ones
    let lastCount = useNotificationStore.getState().notifications.length;

    const unsub = useNotificationStore.subscribe((state) => {
      const { notifications } = state;
      if (notifications.length <= lastCount) {
        lastCount = notifications.length;
        return;
      }
      lastCount = notifications.length;

      // Check if the newest notification is an inbound SMS for this customer
      const latest = notifications[0];
      if (
        latest?.type === "sms_inbound" &&
        latest.entityUrl === `/customers/${customerId}?tab=messages`
      ) {
        refreshConversation();
      }
    });

    return unsub;
  }, [customerId, refreshConversation]);

  const handleSend = () => {
    if (!newMessage.trim() || !customerPhone) return;
    const body = newMessage.trim();
    setNewMessage("");

    startSend(async () => {
      const result = await sendSmsToCustomer({ customerId, body });
      if (result.success) {
        // Refresh conversation
        const conv = await getConversation(customerId);
        if (conv.success && conv.data) {
          setMessages(conv.data.messages.map((m) => ({
            ...m,
            createdAt: typeof m.createdAt === "string" ? m.createdAt : m.createdAt.toISOString(),
          })));
          setNextCursor(conv.data.nextCursor);
        }
      } else {
        toast.error(result.error ?? "Failed to send SMS");
        setNewMessage(body);
      }
    });
  };

  const handleLoadOlder = () => {
    if (!nextCursor) return;
    startLoadMore(async () => {
      const result = await getConversation(customerId, nextCursor);
      if (result.success && result.data) {
        const older = result.data.messages.map((m) => ({
          ...m,
          createdAt: typeof m.createdAt === "string" ? m.createdAt : m.createdAt.toISOString(),
        }));
        setMessages((prev) => [...older, ...prev]);
        setNextCursor(result.data.nextCursor);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!customerPhone) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No phone number on file for {customerName}. Add a phone number to start messaging.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[500px]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {nextCursor && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadOlder}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <ChevronUp className="mr-1 h-3 w-3" />
              )}
              Load older
            </Button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No messages yet. Send the first message to {customerName}.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isOutbound = msg.direction === "outbound";
          const time = mounted
            ? new Date(msg.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";
          return (
            <div
              key={msg.id}
              className={cn(
                "flex",
                isOutbound ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2",
                  isOutbound
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                <div
                  className={cn(
                    "mt-1 flex items-center gap-1.5 text-[10px]",
                    isOutbound
                      ? "text-primary-foreground/70 justify-end"
                      : "text-muted-foreground",
                  )}
                >
                  <span>{time}</span>
                  {isOutbound && (
                    <span className="capitalize">{msg.status}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t p-4">
        <div className="flex items-end gap-2">
          <Textarea
            placeholder={`Message ${customerName}...`}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="resize-none"
          />
          <Button
            onClick={handleSend}
            disabled={isSending || !newMessage.trim()}
            size="icon"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
