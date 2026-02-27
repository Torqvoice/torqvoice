"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Copy, Link2, Loader2, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { generatePublicLink, revokePublicLink } from "@/features/vehicles/Actions/serviceActions";
import { sendInvoiceEmail } from "@/features/email/Actions/emailActions";
import { sendSmsToCustomer, getSmsTemplates } from "@/features/sms/Actions/smsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from "@/lib/sms-templates";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  organizationId: string;
  initialToken: string | null;
  customer?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
}

export function ShareDialog({
  open,
  onOpenChange,
  recordId,
  organizationId,
  initialToken,
  customer,
  smsEnabled = false,
  emailEnabled = false,
}: ShareDialogProps) {
  const t = useTranslations("service.share");
  const [publicToken, setPublicToken] = useState<string | null>(initialToken);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifySms, setNotifySms] = useState(false);
  const [sending, setSending] = useState(false);

  const hasEmail = !!customer?.email;
  const hasPhone = !!customer?.phone;

  const publicUrl = publicToken && organizationId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/invoice/${organizationId}/${publicToken}`
    : null;

  const handleGenerate = async () => {
    setGeneratingLink(true);
    const result = await generatePublicLink(recordId);
    if (result.success && result.data) setPublicToken(result.data.token);
    setGeneratingLink(false);
  };

  const handleRevoke = async () => {
    await revokePublicLink(recordId);
    setPublicToken(null);
  };

  const handleCopy = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNotify = async () => {
    if (!publicUrl || !customer) return;
    setSending(true);

    const results: string[] = [];

    if (notifyEmail && hasEmail) {
      const res = await sendInvoiceEmail({
        serviceRecordId: recordId,
        recipientEmail: customer.email!,
      });
      if (res.success) results.push(t("emailSent"));
      else toast.error(res.error || t("failedEmail"));
    }

    if (notifySms && hasPhone) {
      const tplResult = await getSmsTemplates();
      const tplData = tplResult.success && tplResult.data ? tplResult.data : null;
      const tpl = tplData?.templates[SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY]
        || SMS_TEMPLATE_DEFAULTS[SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY];
      const body = interpolateSmsTemplate(tpl || "", {
        share_link: publicUrl,
        customer_name: customer.name,
        company_name: tplData?.companyName || "",
        current_user: tplData?.currentUser || "",
      });
      const res = await sendSmsToCustomer({
        customerId: customer.id,
        body,
        relatedEntityType: "invoice",
        relatedEntityId: recordId,
      });
      if (res.success) results.push(t("smsSent"));
      else toast.error(res.error || t("failedSms"));
    }

    if (results.length > 0) {
      toast.success(results.join(" & "));
      setNotifyEmail(false);
      setNotifySms(false);
    }
    setSending(false);
  };

  const canNotify = publicUrl && customer && (notifyEmail || notifySms);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
          {publicUrl ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={publicUrl} readOnly className="text-xs font-mono" />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              {/* Notify customer */}
              {customer && (emailEnabled || smsEnabled) && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">{t("notifyTitle", { name: customer.name })}</p>
                  <div className="space-y-2">
                    {emailEnabled && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="notify-email"
                          checked={notifyEmail}
                          onCheckedChange={(v) => setNotifyEmail(v === true)}
                          disabled={!hasEmail}
                        />
                        <Label
                          htmlFor="notify-email"
                          className={`flex items-center gap-1.5 text-sm ${!hasEmail ? "text-muted-foreground/50" : ""}`}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {t("email")}
                          {!hasEmail && <span className="text-xs">{t("noEmail")}</span>}
                        </Label>
                      </div>
                    )}
                    {smsEnabled && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="notify-sms"
                          checked={notifySms}
                          onCheckedChange={(v) => setNotifySms(v === true)}
                          disabled={!hasPhone}
                        />
                        <Label
                          htmlFor="notify-sms"
                          className={`flex items-center gap-1.5 text-sm ${!hasPhone ? "text-muted-foreground/50" : ""}`}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {t("sms")}
                          {!hasPhone && <span className="text-xs">{t("noPhone")}</span>}
                        </Label>
                      </div>
                    )}
                  </div>
                  {canNotify && (
                    <Button size="sm" onClick={handleNotify} disabled={sending} className="w-full">
                      {sending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      {t("sendNotification")}
                    </Button>
                  )}
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleRevoke}
              >
                {t("revokeLink")}
              </Button>
            </>
          ) : (
            <Button onClick={handleGenerate} disabled={generatingLink}>
              {generatingLink && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("generateLink")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
