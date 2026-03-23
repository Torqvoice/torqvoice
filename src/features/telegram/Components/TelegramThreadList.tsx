"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2, Send, User } from "lucide-react";
import type { TelegramThread } from "./TelegramMessagesClient";

export function TelegramThreadList({
  threads,
  hasMore,
  selectedCustomerId,
  isLoadingMore,
  onSelectThread,
  onLoadMore,
  formatRelativeTime,
  t,
}: {
  threads: TelegramThread[];
  hasMore: boolean;
  selectedCustomerId: string | null;
  isLoadingMore: boolean;
  onSelectThread: (id: string) => void;
  onLoadMore: () => void;
  formatRelativeTime: (date: string | Date) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  return (
    <div
      className={cn(
        "flex w-full shrink-0 flex-col sm:w-80 sm:border-r",
        selectedCustomerId ? "hidden sm:flex" : "flex",
      )}
    >
      <div className="shrink-0 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12">
            <Send className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-center text-sm text-muted-foreground">
              {t("empty")}
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
                  onClick={() => onSelectThread(thread.customerId)}
                  className={cn(
                    "w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    isSelected && "bg-muted",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted",
                      )}
                    >
                      <User className="h-4 w-4" />
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
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {thread.lastMessage.direction === "outbound"
                          ? t("you")
                          : ""}
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
                  onClick={onLoadMore}
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
  );
}
