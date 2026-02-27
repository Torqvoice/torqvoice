"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { Bell, FileText, ClipboardCheck, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useNotificationStore } from "../store/notificationStore";
import { markNotificationRead, markAllNotificationsRead, deleteNotification } from "../Actions/notificationActions";

const entityIcons: Record<string, typeof FileText> = {
  quote: FileText,
  inspection: ClipboardCheck,
  invoice: Receipt,
};

export function NotificationBell() {
  const { unreadCount, setPanelOpen } = useNotificationStore();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-8 w-8"
      onClick={() => setPanelOpen(true)}
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Button>
  );
}

export function NotificationPanel() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const { notifications, unreadCount, isPanelOpen, setPanelOpen, markRead, markAllRead, removeNotification } =
    useNotificationStore();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleClickNotification = (id: string, entityUrl: string, read: boolean) => {
    if (pendingDeleteId) {
      setPendingDeleteId(null);
      return;
    }
    if (!read) {
      markRead(id);
      markNotificationRead(id);
    }
    setPanelOpen(false);
    setTimeout(() => {
      router.push(entityUrl);
    }, 300);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const handleConfirmDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeNotification(id);
    deleteNotification(id);
    setPendingDeleteId(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(null);
  };

  const handleMarkAllRead = async () => {
    markAllRead();
    markAllNotificationsRead();
  };

  return (
    <Sheet open={isPanelOpen} onOpenChange={(open) => { setPanelOpen(open); if (!open) setPendingDeleteId(null); }}>
      <SheetContent className="w-[380px] p-0 sm:max-w-[380px]">
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle>{t("panel.title")}</SheetTitle>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {unreadCount}
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={handleMarkAllRead}>
                {t("panel.markAllRead")}
              </Button>
            )}
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-4rem)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">{t("panel.empty")}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const Icon = entityIcons[n.entityType] || Bell;
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    className="flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() => handleClickNotification(n.id, n.entityUrl, n.read)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleClickNotification(n.id, n.entityUrl, n.read); }}
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{n.title}</p>
                        <div className="flex shrink-0 items-center gap-1">
                          {!n.read && (
                            <span className="h-2 w-2 rounded-full bg-primary" />
                          )}
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground"
                            onClick={(e) => handleDeleteClick(e, n.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {pendingDeleteId === n.id ? (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{t("panel.confirmDelete")}</span>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => handleConfirmDelete(e, n.id)}
                          >
                            {t("panel.delete")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={handleCancelDelete}
                          >
                            {t("panel.cancel")}
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {n.message}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground/60">
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
