"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { sendStatusReport } from "../Actions/sendStatusReport";

interface SendStatusReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
    telegramChatId: string | null;
  };
  smsEnabled: boolean;
  emailEnabled: boolean;
  telegramEnabled: boolean;
}

export function SendStatusReportDialog({
  open,
  onOpenChange,
  reportId,
  customer,
  smsEnabled,
  emailEnabled,
  telegramEnabled,
}: SendStatusReportDialogProps) {
  const t = useTranslations("statusReport.send");
  const [message, setMessage] = useState("");
  const [sendSms, setSendSms] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [sendTelegram, setSendTelegram] = useState(false);
  const [sending, setSending] = useState(false);

  const hasPhone = !!customer.phone;
  const hasEmail = !!customer.email;
  const hasTelegram = !!customer.telegramChatId;

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setMessage("");
      setSendSms(false);
      setSendEmail(false);
      setSendTelegram(false);
    }
    onOpenChange(next);
  };

  const handleSend = async () => {
    if (!sendSms && !sendEmail && !sendTelegram) return;
    setSending(true);

    try {
      const res = await sendStatusReport({
        statusReportId: reportId,
        channels: {
          sms: sendSms,
          email: sendEmail,
          telegram: sendTelegram,
        },
        customMessage: message.trim() || undefined,
      });

      if (res.success) {
        const channels: string[] = [];
        if (sendSms) channels.push(t("sms"));
        if (sendEmail) channels.push(t("email"));
        if (sendTelegram) channels.push(t("telegram"));
        toast.success(`${t("sent")}: ${channels.join(", ")}`);
        onOpenChange(false);
      } else {
        toast.error(res.error || t("failed"));
      }
    } catch {
      toast.error(t("failed"));
    } finally {
      setSending(false);
    }
  };

  const canSend = sendSms || sendEmail || sendTelegram;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { name: customer.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("messagePlaceholder")}
            rows={4}
            className="resize-none"
          />

          <div className="space-y-2">
            {/* SMS */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="report-sms"
                checked={sendSms}
                onCheckedChange={(v) => setSendSms(v === true)}
                disabled={!smsEnabled || !hasPhone}
              />
              <Label
                htmlFor="report-sms"
                className={`flex items-center gap-1.5 text-sm ${!smsEnabled || !hasPhone ? "text-muted-foreground/50" : ""}`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {t("sms")}
                {!hasPhone && <span className="text-xs">{t("noPhone")}</span>}
                {hasPhone && !smsEnabled && (
                  <span className="text-xs">{t("notAvailable")}</span>
                )}
              </Label>
            </div>

            {/* Email */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="report-email"
                checked={sendEmail}
                onCheckedChange={(v) => setSendEmail(v === true)}
                disabled={!emailEnabled || !hasEmail}
              />
              <Label
                htmlFor="report-email"
                className={`flex items-center gap-1.5 text-sm ${!emailEnabled || !hasEmail ? "text-muted-foreground/50" : ""}`}
              >
                <Mail className="h-3.5 w-3.5" />
                {t("email")}
                {!hasEmail && <span className="text-xs">{t("noEmail")}</span>}
                {hasEmail && !emailEnabled && (
                  <span className="text-xs">{t("notAvailable")}</span>
                )}
              </Label>
            </div>

            {/* Telegram */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="report-telegram"
                checked={sendTelegram}
                onCheckedChange={(v) => setSendTelegram(v === true)}
                disabled={!telegramEnabled || !hasTelegram}
              />
              <Label
                htmlFor="report-telegram"
                className={`flex items-center gap-1.5 text-sm ${!telegramEnabled || !hasTelegram ? "text-muted-foreground/50" : ""}`}
              >
                <Send className="h-3.5 w-3.5" />
                {t("telegram")}
                {!hasTelegram && (
                  <span className="text-xs">{t("noTelegram")}</span>
                )}
                {hasTelegram && !telegramEnabled && (
                  <span className="text-xs">{t("notAvailable")}</span>
                )}
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("skip")}
            </Button>
            <Button onClick={handleSend} disabled={!canSend || sending}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {t("send")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
