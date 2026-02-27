"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { useGlassModal } from "@/components/glass-modal";
import { sendSmsToCustomer } from "../Actions/smsActions";

interface SendSmsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  customerPhone: string;
  entityLabel?: string;
  defaultMessage?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export function SendSmsDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  customerPhone,
  entityLabel = "SMS",
  defaultMessage = "",
  relatedEntityType,
  relatedEntityId,
}: SendSmsDialogProps) {
  const modal = useGlassModal();
  const t = useTranslations("messages.sendDialog");
  const tc = useTranslations("common.buttons");
  const te = useTranslations("common.errors");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(defaultMessage);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);

    const result = await sendSmsToCustomer({
      customerId,
      body: message.trim(),
      relatedEntityType,
      relatedEntityId,
    });

    if (result.success) {
      modal.open(
        "success",
        t("smsSent"),
        t("sentTo", { label: entityLabel, name: customerName, phone: customerPhone }),
      );
      onOpenChange(false);
      setMessage("");
    } else {
      modal.open("error", te("error"), result.error || t("sendError"));
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t("send", { label: entityLabel })}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
            <span className="text-sm font-medium">{customerName}</span>
            <span className="text-sm text-muted-foreground">{customerPhone}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sms-message">{t("message")}</Label>
            <Textarea
              id="sms-message"
              placeholder={t("placeholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("characters", { count: message.length })}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={sending || !message.trim()}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {t("sendSms")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
