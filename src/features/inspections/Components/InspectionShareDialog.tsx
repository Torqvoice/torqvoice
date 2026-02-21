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
import { Check, Copy, Link2, Loader2, Mail, MessageSquare, Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  generateInspectionPublicLink,
  revokeInspectionPublicLink,
} from "../Actions/inspectionShareActions";
import { sendSmsToCustomer } from "@/features/sms/Actions/smsActions";
import { sendInspectionEmail } from "@/features/email/Actions/emailActions";

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
  const [notifySms, setNotifySms] = useState(false);
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
    setSending(true);

    const results: string[] = [];

    if (notifySms && hasPhone) {
      const res = await sendSmsToCustomer({
        customerId: customer.id,
        body: `Your vehicle inspection report is ready. View it here: ${shareUrl}`,
        relatedEntityType: "inspection",
        relatedEntityId: inspectionId,
      });
      if (res.success) results.push("SMS sent");
      else toast.error(res.error || "Failed to send SMS");
    }

    if (notifyEmail && hasEmail) {
      const res = await sendInspectionEmail({
        inspectionId,
        recipientEmail: customer.email!,
        message: `Your vehicle inspection report is ready. View it here: ${shareUrl}`,
      });
      if (res.success) results.push("Email sent");
      else toast.error(res.error || "Failed to send email");
    }

    if (results.length > 0) {
      toast.success(results.join(" & "));
      setNotifySms(false);
      setNotifyEmail(false);
    }
    setSending(false);
  };

  const canNotify = shareUrl && customer && (notifySms || notifyEmail);

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
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Notify customer */}
              {customer && (smsEnabled || emailEnabled) && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">Notify {customer.name}</p>
                  <div className="space-y-2">
                    {smsEnabled && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="notify-sms-inspection"
                          checked={notifySms}
                          onCheckedChange={(v) => setNotifySms(v === true)}
                          disabled={!hasPhone}
                        />
                        <Label
                          htmlFor="notify-sms-inspection"
                          className={`flex items-center gap-1.5 text-sm ${!hasPhone ? "text-muted-foreground/50" : ""}`}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          SMS
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
