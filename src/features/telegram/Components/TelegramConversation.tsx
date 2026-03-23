"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import { Loader2, Send, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  sendTelegramToCustomer,
  getTelegramConversation,
  deleteTelegramMessage,
} from "../Actions/telegramActions";
import { useNotificationStore } from "@/features/notifications/store/notificationStore";
import { toast } from "sonner";
import type { TelegramMessage } from "./TelegramMessagesClient";
import { TelegramMessageBubble } from "./TelegramMessageBubble";

interface TelegramConversationProps {
  customerId: string;
  customerName: string;
  telegramChatId: string | null;
  initialMessages: TelegramMessage[];
  initialNextCursor: string | null;
  className?: string;
}

export function TelegramConversation({
  customerId,
  customerName,
  telegramChatId,
  initialMessages,
  initialNextCursor,
  className,
}: TelegramConversationProps) {
  const t = useTranslations("telegramMessages.conversation");
  const tc = useTranslations("common.buttons");
  const [messages, setMessages] = useState<TelegramMessage[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [newMessage, setNewMessage] = useState("");
  const [mounted, setMounted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TelegramMessage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSending, startSend] = useTransition();
  const [isLoadingMore, startLoadMore] = useTransition();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const initialScrollDone = useRef(false);
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      });
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  const refreshConversation = useCallback(async () => {
    const conv = await getTelegramConversation(customerId);
    if (conv.success && conv.data) {
      setMessages(conv.data.messages.map((m: TelegramMessage) => ({
        ...m,
        createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date(m.createdAt).toISOString(),
      })));
      setNextCursor(conv.data.nextCursor);
    }
  }, [customerId]);

  useEffect(() => {
    let lastCount = useNotificationStore.getState().notifications.length;
    const unsub = useNotificationStore.subscribe((state) => {
      const { notifications } = state;
      if (notifications.length <= lastCount) { lastCount = notifications.length; return; }
      lastCount = notifications.length;
      const latest = notifications[0];
      if (latest?.type === "telegram_inbound" && latest.entityUrl === `/telegram?customerId=${customerId}`) {
        refreshConversation();
      }
    });
    return unsub;
  }, [customerId, refreshConversation]);

  const handleSend = () => {
    if (!newMessage.trim() || !telegramChatId) return;
    const body = newMessage.trim();
    setNewMessage("");
    startSend(async () => {
      const result = await sendTelegramToCustomer({ customerId, body });
      if (result.success) { await refreshConversation(); }
      else { toast.error(result.error ?? t("sendError")); setNewMessage(body); }
    });
  };

  const handleLoadOlder = () => {
    if (!nextCursor) return;
    startLoadMore(async () => {
      const result = await getTelegramConversation(customerId, nextCursor);
      if (result.success && result.data) {
        const older = result.data.messages.map((m: TelegramMessage) => ({
          ...m,
          createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date(m.createdAt).toISOString(),
        }));
        setMessages((prev) => [...older, ...prev]);
        setNextCursor(result.data.nextCursor);
      }
    });
  };

  const handleDeleteMessage = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteTelegramMessage(deleteTarget.id);
    if (result.success) {
      setMessages((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      toast.success(t("messageDeleted"));
    } else {
      toast.error(result.error || t("deleteError"));
    }
    setIsDeleting(false);
    setDeleteTarget(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!telegramChatId) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Send className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{t("notLinked")}</p>
      </div>
    );
  }

  return (
    <div className={cn("flex h-[500px] flex-col", className)}>
      <div ref={scrollAreaRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {nextCursor && (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={handleLoadOlder} disabled={isLoadingMore}>
              {isLoadingMore ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ChevronUp className="mr-1 h-3 w-3" />}
              {t("loadOlder")}
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <Send className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("empty", { name: customerName })}</p>
          </div>
        )}
        {messages.map((msg) => (
          <TelegramMessageBubble key={msg.id} msg={msg} mounted={mounted} deleteLabel={t("deleteMessage")} onDelete={setDeleteTarget} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 border-t bg-background p-4">
        <div className="flex items-end gap-2">
          <Textarea placeholder={t("placeholder", { name: customerName })} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} rows={2} className="resize-none" />
          <Button onClick={handleSend} disabled={isSending || !newMessage.trim()} size="icon">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMessage} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
