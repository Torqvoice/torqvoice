"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Send, MessageSquare, ChevronUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendSmsToCustomer, getConversation, deleteSmsMessage } from "../Actions/smsActions";
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
  className?: string;
}

export function SmsConversation({
  customerId,
  customerName,
  customerPhone,
  initialMessages,
  initialNextCursor,
  className,
}: SmsConversationProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [newMessage, setNewMessage] = useState("");
  const [mounted, setMounted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDeleteMessage = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteSmsMessage(deleteTarget.id);
    if (result.success) {
      setMessages((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      toast.success("Message deleted");
    } else {
      toast.error(result.error || "Failed to delete message");
    }
    setIsDeleting(false);
    setDeleteTarget(null);
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
    <div className={cn("flex flex-col h-[500px]", className)}>
      {/* Messages area — scrollable, fills available space */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
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
                "group flex",
                isOutbound ? "justify-end" : "justify-start",
              )}
            >
              {/* Delete button — before bubble for outbound, after for inbound */}
              {isOutbound && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(msg)}
                  className="mr-2 self-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  title="Delete message"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
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
              {!isOutbound && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(msg)}
                  className="ml-2 self-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  title="Delete message"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area — pinned to bottom */}
      <div className="shrink-0 border-t bg-background p-4">
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this message from the conversation. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMessage}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
