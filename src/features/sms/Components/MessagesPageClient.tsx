"use client";

import { useState, useEffect, useCallback, useMemo, useTransition, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  Inbox,
  Loader2,
  MessageSquare,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { getConversation, getRecentSmsThreads, deleteConversation } from "../Actions/smsActions";
import { SmsConversation } from "./SmsConversation";
import { NewSmsDialog } from "./NewSmsDialog";
import { useNotificationStore } from "@/features/notifications/store/notificationStore";
import { ScheduledMessageList } from "@/features/scheduled-messages/Components/ScheduledMessageList";
import { ScheduleMessageDialog } from "@/features/scheduled-messages/Components/ScheduleMessageDialog";
import { getScheduledMessages, type ScheduledMessageListItem } from "@/features/scheduled-messages/Actions/scheduledMessageActions";
import type { MessageChannel } from "@/features/scheduled-messages/Schema/scheduledMessageSchema";

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

type Tab = "inbox" | "scheduled";

const THREADS_PAGE_SIZE = 50;

/** Initials for the avatar: first letters of the first two words. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Stable per-name tint, so the same customer always looks the same. */
const AVATAR_TINTS = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
];

function avatarTint(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

export function MessagesPageClient({
  initialThreads,
  initialHasMore = false,
  initialScheduled = [],
  availableChannels = [],
  smsConfigured = true,
}: {
  initialThreads: SmsThread[];
  initialHasMore?: boolean;
  initialScheduled?: ScheduledMessageListItem[];
  availableChannels?: MessageChannel[];
  /** False when SMS has no provider set up: the inbox is replaced by a nudge */
  smsConfigured?: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("messages.threads");
  const tp = useTranslations("messages.page");
  const ts = useTranslations("scheduledMessages.list");
  const tcomp = useTranslations("messages.compose");
  const tc = useTranslations("common.buttons");

  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "scheduled" ? "scheduled" : "inbox";

  const [threads, setThreads] = useState<SmsThread[]>(initialThreads);
  const [scheduled, setScheduled] = useState<ScheduledMessageListItem[]>(initialScheduled);
  const [search, setSearch] = useState("");
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
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  // Carried over when a draft is handed from compose to scheduling
  const [scheduleSeed, setScheduleSeed] = useState<{
    customer: { id: string; name: string; company: string | null } | null;
    body: string;
  } | null>(null);

  /** Tabs live in the URL, so a conversation or the queue can be linked to directly. */
  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "inbox") params.delete("tab");
      else params.set("tab", next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

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

  const handleBack = () => {
    setSelectedCustomerId(null);
    setConversation(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("customerId");
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

  const refreshScheduled = useCallback(async () => {
    const result = await getScheduledMessages();
    if (result.success && result.data) setScheduled(result.data);
  }, []);

  const handleDeleteConversation = async () => {
    if (!deleteThreadTarget) return;
    setIsDeletingThread(true);
    const result = await deleteConversation(deleteThreadTarget.customerId);
    if (result.success) {
      toast.success(t("deleted"));
      setThreads((prev) => prev.filter((t) => t.customerId !== deleteThreadTarget.customerId));
      if (selectedCustomerId === deleteThreadTarget.customerId) {
        setSelectedCustomerId(null);
        setConversation(null);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("customerId");
        router.replace(`?${params.toString()}`, { scroll: false });
      }
    } else {
      toast.error(result.error || t("deleteError"));
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

    if (diffMins < 1) return t("now");
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const visibleThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (thread) =>
        thread.customerName.toLowerCase().includes(q) ||
        thread.customerPhone?.toLowerCase().includes(q) ||
        thread.lastMessage.body.toLowerCase().includes(q),
    );
  }, [threads, search]);

  const upcomingCount = useMemo(
    () => scheduled.filter((m) => m.status === "scheduled").length,
    [scheduled],
  );

  /** Delivery state of the last outbound message, shown beside the preview. */
  const deliveryIcon = (thread: SmsThread) => {
    if (thread.lastMessage.direction !== "outbound") return null;
    switch (thread.lastMessage.status) {
      case "failed":
        return <TriangleAlert className="h-3 w-3 shrink-0 text-red-500" />;
      case "delivered":
        return <CheckCheck className="h-3 w-3 shrink-0 text-muted-foreground" />;
      default:
        return <Check className="h-3 w-3 shrink-0 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Tab bar, mirrored in the URL */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            size="sm"
            variant={tab === "inbox" ? "default" : "ghost"}
            className="h-8"
            onClick={() => setTab("inbox")}
          >
            <Inbox className="mr-1.5 h-3.5 w-3.5" />
            {tp("tabs.inbox")}
          </Button>
          <Button
            size="sm"
            variant={tab === "scheduled" ? "default" : "ghost"}
            className="h-8"
            onClick={() => setTab("scheduled")}
          >
            <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
            {tp("tabs.scheduled")}
            {upcomingCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">
                {upcomingCount}
              </Badge>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setScheduleSeed(null);
              setShowScheduleDialog(true);
            }}
          >
            <CalendarClock className="mr-1 h-3.5 w-3.5" />
            {ts("scheduleMessage")}
          </Button>
          {smsConfigured && (
            <Button size="sm" onClick={() => setShowComposeDialog(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {tcomp("newMessage")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex h-[calc(100vh-11rem)] overflow-hidden rounded-lg border bg-background">
        {tab === "scheduled" ? (
          <div className="flex-1 min-w-0">
            <ScheduledMessageList
              messages={scheduled}
              availableChannels={availableChannels}
              onChanged={refreshScheduled}
            />
          </div>
        ) : !smsConfigured ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
            <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">{tp("smsNotConfiguredTitle")}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {tp("smsNotConfiguredHint")}
            </p>
            <Button size="sm" variant="outline" className="mt-4" asChild>
              <a href="/settings/sms">{tp("goToSmsSettings")}</a>
            </Button>
          </div>
        ) : (
          <>
            {/* Thread list — full width on mobile, hidden when a conversation is open */}
            <div
              className={cn(
                "w-full sm:w-80 shrink-0 sm:border-r flex flex-col",
                selectedCustomerId ? "hidden sm:flex" : "flex",
              )}
            >
              <div className="shrink-0 space-y-2 border-b px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{t("title")}</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {threads.length}
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="h-8 pl-8 text-sm"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {visibleThreads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-12">
                    <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-center text-sm text-muted-foreground">
                      {search ? t("noSearchResults") : t("empty")}
                    </p>
                    {!search && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => setShowComposeDialog(true)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {tcomp("newMessage")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {visibleThreads.map((thread) => {
                      const isSelected = selectedCustomerId === thread.customerId;
                      const isInbound = thread.lastMessage.direction === "inbound";
                      return (
                        <button
                          key={thread.customerId}
                          type="button"
                          onClick={() => handleSelectThread(thread.customerId)}
                          className={cn(
                            "w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                            isSelected && "bg-muted",
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                avatarTint(thread.customerId),
                              )}
                            >
                              {initials(thread.customerName)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-sm font-medium">
                                  {thread.customerName}
                                </span>
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {formatRelativeTime(thread.lastMessage.createdAt)}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-1">
                                {deliveryIcon(thread)}
                                <p
                                  className={cn(
                                    "truncate text-xs",
                                    isInbound ? "text-foreground" : "text-muted-foreground",
                                  )}
                                >
                                  {!isInbound && t("you")}
                                  {thread.lastMessage.body}
                                </p>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {hasMore && !search && (
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
                          {t("loadMore")}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Conversation panel */}
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col",
                selectedCustomerId ? "flex" : "hidden sm:flex",
              )}
            >
              {selectedCustomerId && conversation && !loadingConversation ? (
                <>
                  <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 sm:hidden"
                      onClick={handleBack}
                      aria-label={t("back")}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        avatarTint(selectedCustomerId),
                      )}
                    >
                      {initials(conversation.customerName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{conversation.customerName}</p>
                      {conversation.customerPhone && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {conversation.customerPhone}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label={t("conversationMenu")}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setShowScheduleDialog(true)}>
                          <CalendarClock className="mr-2 h-4 w-4" />
                          {ts("scheduleForCustomer")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            const thread = threads.find((t) => t.customerId === selectedCustomerId);
                            if (thread) setDeleteThreadTarget(thread);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("deleteConversation")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <SmsConversation
                    key={selectedCustomerId}
                    customerId={selectedCustomerId}
                    customerName={conversation.customerName}
                    customerPhone={conversation.customerPhone}
                    initialMessages={conversation.messages}
                    initialNextCursor={conversation.nextCursor}
                    className="h-auto min-h-0 flex-1"
                  />
                </>
              ) : loadingConversation ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                  <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm">{t("selectConversation")}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setShowComposeDialog(true)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {tcomp("newMessage")}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <NewSmsDialog
        open={showComposeDialog}
        onOpenChange={setShowComposeDialog}
        onSent={async (customerId) => {
          await refreshThreads();
          handleSelectThread(customerId);
        }}
        onSchedule={(recipient, body) => {
          setScheduleSeed({
            customer: recipient
              ? { id: recipient.id, name: recipient.name, company: recipient.company }
              : null,
            body,
          });
          setShowScheduleDialog(true);
        }}
      />

      <ScheduleMessageDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        availableChannels={availableChannels}
        defaultCustomer={
          scheduleSeed?.customer ??
          (selectedCustomerId && conversation
            ? { id: selectedCustomerId, name: conversation.customerName, company: null }
            : null)
        }
        defaultBody={scheduleSeed?.body}
        onSaved={() => {
          setScheduleSeed(null);
          refreshScheduled();
          setTab("scheduled");
        }}
      />

      {/* Delete conversation confirmation */}
      <AlertDialog
        open={!!deleteThreadTarget}
        onOpenChange={(open) => !open && setDeleteThreadTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { name: deleteThreadTarget?.customerName ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingThread}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeletingThread}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingThread && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
