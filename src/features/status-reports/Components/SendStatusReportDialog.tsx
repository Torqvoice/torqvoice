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
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { sendStatusReport } from "../Actions/sendStatusReport";

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.46h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

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
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [sendTelegram, setSendTelegram] = useState(false);
  const [sending, setSending] = useState(false);

  const hasPhone = !!customer.phone;
  const hasEmail = !!customer.email;
  const hasTelegram = !!customer.telegramChatId;

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setMessage("");
      setSendWhatsapp(false);
      setSendEmail(false);
      setSendTelegram(false);
    }
    onOpenChange(next);
  };

  const handleSend = async () => {
    if (!sendWhatsapp && !sendEmail && !sendTelegram) return;
    setSending(true);

    let whatsappWindow: Window | null = null;
    if (sendWhatsapp && hasPhone) {
      // Open a blank tab synchronously to prevent browser popup blockers
      whatsappWindow = window.open("", "_blank");
    }

    try {
      const res = await sendStatusReport({
        statusReportId: reportId,
        channels: {
          whatsapp: sendWhatsapp,
          email: sendEmail,
          telegram: sendTelegram,
        },
        customMessage: message.trim() || undefined,
      });

      if (res.success) {
        if (res.data?.whatsappUrl && whatsappWindow) {
          whatsappWindow.location.href = res.data.whatsappUrl;
        } else if (whatsappWindow) {
          whatsappWindow.close();
        }

        const channels: string[] = [];
        if (sendWhatsapp) channels.push("WhatsApp");
        if (sendEmail) channels.push(t("email"));
        if (sendTelegram) channels.push(t("telegram"));
        toast.success(`${t("sent")}: ${channels.join(", ")}`);
        onOpenChange(false);
      } else {
        if (whatsappWindow) whatsappWindow.close();
        toast.error(res.error || t("failed"));
      }
    } catch {
      if (whatsappWindow) whatsappWindow.close();
      toast.error(t("failed"));
    } finally {
      setSending(false);
    }
  };

  const canSend = sendWhatsapp || sendEmail || sendTelegram;

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
            {/* WhatsApp */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="report-whatsapp"
                checked={sendWhatsapp}
                onCheckedChange={(v) => setSendWhatsapp(v === true)}
                disabled={!hasPhone}
              />
              <Label
                htmlFor="report-whatsapp"
                className={`flex items-center gap-1.5 text-sm ${!hasPhone ? "text-muted-foreground/50" : ""}`}
              >
                <WhatsAppIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
                WhatsApp
                {!hasPhone && <span className="text-xs">{t("noPhone")}</span>}
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
