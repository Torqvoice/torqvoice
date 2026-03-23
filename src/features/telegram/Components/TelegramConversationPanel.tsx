"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, MoreVertical, Send, Trash2, User } from "lucide-react";
import { TelegramConversation } from "./TelegramConversation";
import type { TelegramThread, TelegramMessage } from "./TelegramMessagesClient";

export function TelegramConversationPanel({
  selectedCustomerId,
  conversation,
  loadingConversation,
  threads,
  onBack,
  onDeleteThread,
  t,
}: {
  selectedCustomerId: string | null;
  conversation: {
    messages: TelegramMessage[];
    nextCursor: string | null;
    customerName: string;
    telegramChatId: string | null;
  } | null;
  loadingConversation: boolean;
  threads: TelegramThread[];
  onBack: () => void;
  onDeleteThread: (thread: TelegramThread) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col",
        selectedCustomerId ? "flex" : "hidden sm:flex",
      )}
    >
      {selectedCustomerId && conversation && !loadingConversation ? (
        <>
          <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 sm:hidden"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {conversation.customerName}
              </p>
              {conversation.telegramChatId && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Send className="h-3 w-3" />
                  Telegram
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    const thread = threads.find(
                      (th) => th.customerId === selectedCustomerId,
                    );
                    if (thread) onDeleteThread(thread);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("deleteConversation")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <TelegramConversation
            key={selectedCustomerId}
            customerId={selectedCustomerId}
            customerName={conversation.customerName}
            telegramChatId={conversation.telegramChatId}
            initialMessages={conversation.messages}
            initialNextCursor={conversation.nextCursor}
            className="h-auto min-h-0 flex-1"
          />
        </>
      ) : loadingConversation ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
          <Send className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm">{t("selectConversation")}</p>
        </div>
      )}
    </div>
  );
}
