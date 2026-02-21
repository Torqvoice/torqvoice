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
import { sendSmsToCustomer } from "@/features/sms/Actions/smsActions";
import { sendNotificationEmail } from "@/features/email/Actions/emailActions";

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
  const [sendSms, setSendSms] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);

  const hasPhone = !!customer.phone;
  const hasEmail = !!customer.email;

  // Reset state when dialog opens with new message
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setMessage(defaultMessage);
      setSendSms(false);
      setSendEmail(false);
    }
    onOpenChange(next);
  };

  const handleSend = async () => {
    if (!sendSms && !sendEmail) return;
    setSending(true);

    const results: string[] = [];

    if (sendSms && hasPhone) {
      const res = await sendSmsToCustomer({
        customerId: customer.id,
        body: message,
        relatedEntityType,
        relatedEntityId,
      });
      if (res.success) results.push("SMS sent");
      else toast.error(res.error || "Failed to send SMS");
    }

    if (sendEmail && hasEmail) {
      const res = await sendNotificationEmail({
        recipientEmail: customer.email!,
        subject: emailSubject,
        body: message,
      });
      if (res.success) results.push("Email sent");
      else toast.error(res.error || "Failed to send email");
    }

    if (results.length > 0) {
      toast.success(results.join(" & "));
    }

    setSending(false);
    onOpenChange(false);
  };

  const canSend = (sendSms || sendEmail) && message.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notify {customer.name}</DialogTitle>
          <DialogDescription>
            Send a notification to the customer about this update.
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
                id="notify-sms"
                checked={sendSms}
                onCheckedChange={(v) => setSendSms(v === true)}
                disabled={!smsEnabled || !hasPhone}
              />
              <Label
                htmlFor="notify-sms"
                className={`flex items-center gap-1.5 text-sm ${!smsEnabled || !hasPhone ? "text-muted-foreground/50" : ""}`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                SMS
                {!hasPhone && <span className="text-xs">(no phone on file)</span>}
                {hasPhone && !smsEnabled && <span className="text-xs">(not available)</span>}
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
                Email
                {!hasEmail && <span className="text-xs">(no email on file)</span>}
                {hasEmail && !emailEnabled && <span className="text-xs">(not available)</span>}
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Skip
            </Button>
            <Button onClick={handleSend} disabled={!canSend || sending}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
