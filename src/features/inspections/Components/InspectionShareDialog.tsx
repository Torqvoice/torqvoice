"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Check, Copy, Link2, Loader2, Mail, Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  generateInspectionPublicLink,
  revokeInspectionPublicLink,
} from "../Actions/inspectionShareActions";
import { getSmsTemplates } from "@/features/sms/Actions/smsActions";
import { sendInspectionEmail } from "@/features/email/Actions/emailActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from "@/lib/sms-templates";

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.46h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface InspectionShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  organizationId: string;
  publicToken: string | null;
  customer?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
}

export function InspectionShareDialog({
  open,
  onOpenChange,
  inspectionId,
  organizationId,
  publicToken,
  customer,
  smsEnabled = false,
  emailEnabled = false,
}: InspectionShareDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState(publicToken);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [sending, setSending] = useState(false);

  const hasPhone = !!customer?.phone;
  const hasEmail = !!customer?.email;

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/inspection/${organizationId}/${token}`
    : null;

  const handleGenerate = () => {
    startTransition(async () => {
      const result = await generateInspectionPublicLink(inspectionId);
      if (result.success && result.data) {
        setToken(result.data.token);
        toast.success("Share link generated");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to generate link");
      }
    });
  };

  const handleRevoke = () => {
    startTransition(async () => {
      const result = await revokeInspectionPublicLink(inspectionId);
      if (result.success) {
        setToken(null);
        toast.success("Share link revoked");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to revoke link");
      }
    });
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNotify = async () => {
    if (!shareUrl || !customer) return;

    let whatsappOpened = false;

    if (notifyWhatsapp && hasPhone) {
      const tplResult = await getSmsTemplates();
      const tplData = tplResult.success && tplResult.data ? tplResult.data : null;
      const tpl = tplData?.templates[SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY]
        || SMS_TEMPLATE_DEFAULTS[SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY];
      const body = interpolateSmsTemplate(tpl || "", {
        share_link: shareUrl,
        customer_name: customer.name,
        company_name: tplData?.companyName || "",
        current_user: tplData?.currentUser || "",
      });
      const cleanPhone = customer.phone!.replace(/\D/g, "");
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(body)}`;
      window.open(whatsappUrl, "_blank");
      whatsappOpened = true;
    }

    const results: string[] = [];

    if (notifyEmail && hasEmail) {
      setSending(true);
      const res = await sendInspectionEmail({
        inspectionId,
        recipientEmail: customer.email!,
        message: `El informe de inspección de tu vehículo está listo. Míralo aquí: ${shareUrl}`,
      });
      setSending(false);
      if (res.success) results.push("Email sent");
      else toast.error(res.error || "Failed to send email");
    }

    if (whatsappOpened) {
      results.push("WhatsApp");
    }

    if (results.length > 0) {
      toast.success(results.join(" & "));
      setNotifyWhatsapp(false);
      setNotifyEmail(false);
    }
  };

  const canNotify = shareUrl && customer && (notifyWhatsapp || notifyEmail);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Inspection</DialogTitle>
          <DialogDescription>
            Share a read-only view of this inspection with your customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {shareUrl ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={shareUrl} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy} aria-label="Copy link">
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Notify customer */}
              {customer && (hasPhone || emailEnabled) && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">Notify {customer.name}</p>
                  <div className="space-y-2">
                    {hasPhone && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="notify-whatsapp-inspection"
                          checked={notifyWhatsapp}
                          onCheckedChange={(v) => setNotifyWhatsapp(v === true)}
                          disabled={!hasPhone}
                        />
                        <Label
                          htmlFor="notify-whatsapp-inspection"
                          className={`flex items-center gap-1.5 text-sm ${!hasPhone ? "text-muted-foreground/50" : ""}`}
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
                          WhatsApp
                          {!hasPhone && <span className="text-xs">(no phone on file)</span>}
                        </Label>
                      </div>
                    )}
                    {emailEnabled && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="notify-email-inspection"
                          checked={notifyEmail}
                          onCheckedChange={(v) => setNotifyEmail(v === true)}
                          disabled={!hasEmail}
                        />
                        <Label
                          htmlFor="notify-email-inspection"
                          className={`flex items-center gap-1.5 text-sm ${!hasEmail ? "text-muted-foreground/50" : ""}`}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          Email
                          {!hasEmail && <span className="text-xs">(no email on file)</span>}
                        </Label>
                      </div>
                    )}
                  </div>
                  {canNotify && (
                    <Button size="sm" onClick={handleNotify} disabled={sending} className="w-full">
                      {sending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Send Notification
                    </Button>
                  )}
                </div>
              )}

              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={handleRevoke}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="mr-2 h-4 w-4" />
                )}
                Revoke Link
              </Button>
            </>
          ) : (
            <Button className="w-full" onClick={handleGenerate} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              Generate Share Link
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
