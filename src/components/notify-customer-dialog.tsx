"use client";

import { useState, useEffect } from "react";
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
import { sendNotificationEmail } from "@/features/email/Actions/emailActions";
import { useTranslations } from "next-intl";

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.46h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface NotifyCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  defaultMessage: string;
  emailSubject: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export function NotifyCustomerDialog({
  open,
  onOpenChange,
  customer,
  defaultMessage,
  emailSubject,
  smsEnabled,
  emailEnabled,
  relatedEntityType,
  relatedEntityId,
}: NotifyCustomerDialogProps) {
  const [message, setMessage] = useState(defaultMessage);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const t = useTranslations("workOrders.notify");

  const hasPhone = !!customer.phone;
  const hasEmail = !!customer.email;

  // Sync message when defaultMessage prop changes (e.g. async template load)
  useEffect(() => {
    if (defaultMessage) setMessage(defaultMessage);
  }, [defaultMessage]);

  // Reset state when dialog opens with new message
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setMessage(defaultMessage);
      setSendWhatsapp(false);
      setSendEmail(false);
    }
    onOpenChange(next);
  };

  const handleSend = async () => {
    if (!sendWhatsapp && !sendEmail) return;

    let whatsappOpened = false;

    if (sendWhatsapp && hasPhone) {
      const cleanPhone = customer.phone!.replace(/\D/g, "");
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, "_blank");
      whatsappOpened = true;
    }

    const results: string[] = [];

    if (sendEmail && hasEmail) {
      setSending(true);
      const res = await sendNotificationEmail({
        recipientEmail: customer.email!,
        subject: emailSubject,
        body: message,
      });
      setSending(false);
      if (res.success) results.push(t("emailSent"));
      else toast.error(res.error || t("failedEmail"));
    }

    if (whatsappOpened) {
      results.push("WhatsApp");
    }

    if (results.length > 0) {
      toast.success(results.join(" & "));
    }

    onOpenChange(false);
  };

  const canSend = (sendWhatsapp || sendEmail) && message.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { name: customer.name })}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="resize-none"
          />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="notify-whatsapp"
                checked={sendWhatsapp}
                onCheckedChange={(v) => setSendWhatsapp(v === true)}
                disabled={!hasPhone}
              />
              <Label
                htmlFor="notify-whatsapp"
                className={`flex items-center gap-1.5 text-sm ${!hasPhone ? "text-muted-foreground/50" : ""}`}
              >
                <WhatsAppIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
                WhatsApp
                {!hasPhone && <span className="text-xs">{t("noPhone")}</span>}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="notify-email"
                checked={sendEmail}
                onCheckedChange={(v) => setSendEmail(v === true)}
                disabled={!emailEnabled || !hasEmail}
              />
              <Label
                htmlFor="notify-email"
                className={`flex items-center gap-1.5 text-sm ${!emailEnabled || !hasEmail ? "text-muted-foreground/50" : ""}`}
              >
                <Mail className="h-3.5 w-3.5" />
                {t("email")}
                {!hasEmail && <span className="text-xs">{t("noEmail")}</span>}
                {hasEmail && !emailEnabled && <span className="text-xs">{t("notAvailable")}</span>}
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
