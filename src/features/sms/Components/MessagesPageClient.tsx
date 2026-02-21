"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Loader2, MessageSquare, MoreVertical, Phone, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { getConversation, getRecentSmsThreads, deleteConversation } from "../Actions/smsActions";
import { SmsConversation } from "./SmsConversation";
import { useNotificationStore } from "@/features/notifications/store/notificationStore";

interface SmsThread {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  lastMessage: {
    id: string;
    body: string;
    direction: string;
    status: string;
    createdAt: string | Date;
  };
}

interface Message {
  id: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string | Date;
  fromNumber: string;
  toNumber: string;
}

const THREADS_PAGE_SIZE = 50;

export function MessagesPageClient({
  initialThreads,
  initialHasMore = false,
}: {
  initialThreads: SmsThread[];
  initialHasMore?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [threads, setThreads] = useState<SmsThread[]>(initialThreads);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    searchParams.get("customerId"),
  );
  const [conversation, setConversation] = useState<{
    messages: Message[];
    nextCursor: string | null;
    customerName: string;
    customerPhone: string | null;
  } | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [isLoadingMore, startLoadMore] = useTransition();
  const [deleteThreadTarget, setDeleteThreadTarget] = useState<SmsThread | null>(null);
  const [isDeletingThread, setIsDeletingThread] = useState(false);

  const loadConversation = useCallback(async (customerId: string) => {
    setLoadingConversation(true);
    const result = await getConversation(customerId);
    if (result.success && result.data) {
      const thread = threads.find((t) => t.customerId === customerId);
      setConversation({
        messages: result.data.messages.map((m) => ({
          ...m,
          createdAt: typeof m.createdAt === "string" ? m.createdAt : m.createdAt.toISOString(),
        })),
        nextCursor: result.data.nextCursor,
        customerName: thread?.customerName || "",
        customerPhone: thread?.customerPhone || null,
      });
    }
    setLoadingConversation(false);
  }, [threads]);

  // Load conversation from URL param on mount
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    const convId = searchParams.get("customerId");
    if (convId) {
      loadConversation(convId);
    }
  }, [searchParams, loadConversation]);

  const handleSelectThread = (customerId: string) => {
    setSelectedCustomerId(customerId);
    loadConversation(customerId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("customerId", customerId);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleLoadMore = () => {
    startLoadMore(async () => {
      const result = await getRecentSmsThreads(threads.length, THREADS_PAGE_SIZE);
      if (result.success && result.data) {
        setThreads((prev) => [...prev, ...result.data!.threads]);
        setHasMore(result.data.hasMore);
      }
    });
  };

  // Re-fetch threads when inbound SMS arrives
  const refreshThreads = useCallback(async () => {
    const result = await getRecentSmsThreads(0, threads.length || THREADS_PAGE_SIZE);
    if (result.success && result.data) {
      setThreads(result.data.threads);
      setHasMore(result.data.hasMore);
    }
  }, [threads.length]);

  const handleDeleteConversation = async () => {
    if (!deleteThreadTarget) return;
    setIsDeletingThread(true);
    const result = await deleteConversation(deleteThreadTarget.customerId);
    if (result.success) {
      toast.success("Conversation deleted");
      setThreads((prev) => prev.filter((t) => t.customerId !== deleteThreadTarget.customerId));
      if (selectedCustomerId === deleteThreadTarget.customerId) {
        setSelectedCustomerId(null);
        setConversation(null);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("customerId");
        router.replace(`?${params.toString()}`, { scroll: false });
      }
    } else {
      toast.error(result.error || "Failed to delete conversation");
    }
    setIsDeletingThread(false);
    setDeleteThreadTarget(null);
  };

  useEffect(() => {
    let lastCount = useNotificationStore.getState().notifications.length;

    const unsub = useNotificationStore.subscribe((state) => {
      const { notifications } = state;
      if (notifications.length <= lastCount) {
        lastCount = notifications.length;
        return;
      }
      lastCount = notifications.length;

      const latest = notifications[0];
      if (latest?.type === "sms_inbound") {
        refreshThreads();
      }
    });

    return unsub;
  }, [refreshThreads]);

  const formatRelativeTime = (date: string | Date) => {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-lg border overflow-hidden bg-background">
      {/* Thread list */}
      <div className="w-80 shrink-0 border-r flex flex-col">
        <div className="shrink-0 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Conversations</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground text-center">
                No conversations yet. Send an SMS from a customer page to start.
              </p>
            </div>
          ) : (
            <>
              {threads.map((thread) => {
                const isSelected = selectedCustomerId === thread.customerId;
                return (
                  <button
                    key={thread.customerId}
                    type="button"
                    onClick={() => handleSelectThread(thread.customerId)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50",
                      isSelected && "bg-muted",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}>
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium text-sm truncate">
                            {thread.customerName}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatRelativeTime(thread.lastMessage.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {thread.lastMessage.direction === "outbound" ? "You: " : ""}
                          {thread.lastMessage.body}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <div className="p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronDown className="mr-2 h-3.5 w-3.5" />
                    )}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Conversation panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedCustomerId && conversation && !loadingConversation ? (
          <>
            {/* Conversation header */}
            <div className="shrink-0 border-b px-4 py-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{conversation.customerName}</p>
                {conversation.customerPhone && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {conversation.customerPhone}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      const thread = threads.find((t) => t.customerId === selectedCustomerId);
                      if (thread) setDeleteThreadTarget(thread);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete conversation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {/* Conversation body — fills remaining height, input pinned to bottom */}
            <SmsConversation
              key={selectedCustomerId}
              customerId={selectedCustomerId}
              customerName={conversation.customerName}
              customerPhone={conversation.customerPhone}
              initialMessages={conversation.messages}
              initialNextCursor={conversation.nextCursor}
              className="h-auto flex-1 min-h-0"
            />
          </>
        ) : loadingConversation ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm">Select a conversation</p>
          </div>
        )}
      </div>

      {/* Delete conversation confirmation */}
      <AlertDialog open={!!deleteThreadTarget} onOpenChange={(open) => !open && setDeleteThreadTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all messages with{" "}
              <span className="font-medium text-foreground">{deleteThreadTarget?.customerName}</span>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingThread}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeletingThread}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingThread && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
