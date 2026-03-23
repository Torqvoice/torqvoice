"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getTelegramConversation, deleteTelegramConversation } from "../Actions/telegramActions";
import { getRecentTelegramThreads } from "../Actions/telegramThreadActions";
import { TelegramThreadList } from "./TelegramThreadList";
import { TelegramConversationPanel } from "./TelegramConversationPanel";
import { useNotificationStore } from "@/features/notifications/store/notificationStore";

export interface TelegramThread {
  customerId: string;
  customerName: string;
  telegramChatId: string | null;
  lastMessage: { id: string; body: string; direction: string; createdAt: string | Date };
}

export interface TelegramMessage {
  id: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string | Date;
  chatId: string;
}

const PAGE_SIZE = 50;

function formatRelativeTime(date: string | Date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(diffMs / 3600000);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(diffMs / 86400000);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function TelegramMessagesClient({ initialThreads, initialHasMore = false }: { initialThreads: TelegramThread[]; initialHasMore?: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("telegramMessages.threads");
  const tc = useTranslations("common.buttons");
  const [threads, setThreads] = useState<TelegramThread[]>(initialThreads);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(searchParams.get("customerId"));
  const [conversation, setConversation] = useState<{ messages: TelegramMessage[]; nextCursor: string | null; customerName: string; telegramChatId: string | null } | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [isLoadingMore, startLoadMore] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<TelegramThread | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const normalizeMessages = (msgs: TelegramMessage[]) =>
    msgs.map((m) => ({ ...m, createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date(m.createdAt).toISOString() }));

  const loadConversation = useCallback(async (cid: string) => {
    setLoadingConversation(true);
    const result = await getTelegramConversation(cid);
    if (result.success && result.data) {
      const thread = threads.find((th) => th.customerId === cid);
      setConversation({ messages: normalizeMessages(result.data.messages), nextCursor: result.data.nextCursor, customerName: thread?.customerName || "", telegramChatId: thread?.telegramChatId || null });
    }
    setLoadingConversation(false);
  }, [threads]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    const cid = searchParams.get("customerId");
    if (cid) loadConversation(cid);
  }, [searchParams, loadConversation]);

  const updateUrl = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleSelectThread = (cid: string) => {
    setSelectedCustomerId(cid);
    loadConversation(cid);
    updateUrl("customerId", cid);
  };

  const handleBack = () => {
    setSelectedCustomerId(null);
    setConversation(null);
    updateUrl("customerId", null);
  };

  const handleLoadMore = () => {
    startLoadMore(async () => {
      const result = await getRecentTelegramThreads(threads.length, PAGE_SIZE);
      if (result.success && result.data) {
        setThreads((prev) => [...prev, ...result.data!.threads]);
        setHasMore(result.data.hasMore);
      }
    });
  };

  const refreshThreads = useCallback(async () => {
    const result = await getRecentTelegramThreads(0, threads.length || PAGE_SIZE);
    if (result.success && result.data) {
      setThreads(result.data.threads);
      setHasMore(result.data.hasMore);
    }
  }, [threads.length]);

  const handleDeleteConversation = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteTelegramConversation(deleteTarget.customerId);
    if (result.success) {
      toast.success(t("deleted"));
      setThreads((prev) => prev.filter((th) => th.customerId !== deleteTarget.customerId));
      if (selectedCustomerId === deleteTarget.customerId) { setSelectedCustomerId(null); setConversation(null); updateUrl("customerId", null); }
    } else { toast.error(result.error || t("deleteError")); }
    setIsDeleting(false);
    setDeleteTarget(null);
  };

  useEffect(() => {
    let lastCount = useNotificationStore.getState().notifications.length;
    const unsub = useNotificationStore.subscribe((state) => {
      if (state.notifications.length <= lastCount) { lastCount = state.notifications.length; return; }
      lastCount = state.notifications.length;
      if (state.notifications[0]?.type === "telegram_inbound") refreshThreads();
    });
    return unsub;
  }, [refreshThreads]);

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-lg border bg-background">
      <TelegramThreadList threads={threads} hasMore={hasMore} selectedCustomerId={selectedCustomerId} isLoadingMore={isLoadingMore} onSelectThread={handleSelectThread} onLoadMore={handleLoadMore} formatRelativeTime={formatRelativeTime} t={t} />
      <TelegramConversationPanel selectedCustomerId={selectedCustomerId} conversation={conversation} loadingConversation={loadingConversation} threads={threads} onBack={handleBack} onDeleteThread={setDeleteTarget} t={t} />
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription", { name: deleteTarget?.customerName ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConversation} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
