"use client";

import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import type { TelegramMessage } from "./TelegramMessagesClient";

export function TelegramMessageBubble({
  msg,
  mounted,
  deleteLabel,
  onDelete,
}: {
  msg: TelegramMessage;
  mounted: boolean;
  deleteLabel: string;
  onDelete: (msg: TelegramMessage) => void;
}) {
  const isOutbound = msg.direction === "outbound";
  const time = mounted
    ? new Date(msg.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div
      className={cn(
        "group flex",
        isOutbound ? "justify-end" : "justify-start",
      )}
    >
      {isOutbound && (
        <button
          type="button"
          onClick={() => onDelete(msg)}
          className="mr-2 self-center text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          title={deleteLabel}
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
        <p className="whitespace-pre-wrap text-sm">{msg.body}</p>
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 text-[10px]",
            isOutbound
              ? "justify-end text-primary-foreground/70"
              : "text-muted-foreground",
          )}
        >
          <span>{time}</span>
          {isOutbound && <span className="capitalize">{msg.status}</span>}
        </div>
      </div>
      {!isOutbound && (
        <button
          type="button"
          onClick={() => onDelete(msg)}
          className="ml-2 self-center text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          title={deleteLabel}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
