"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Copy, Mail, Send } from "lucide-react";
import { toast } from "sonner";

export function TelegramQrCode({
  botUsername,
  customerId,
  customerName,
  customerEmail,
}: {
  botUsername: string;
  customerId: string;
  customerName: string;
  customerEmail?: string | null;
}) {
  const t = useTranslations("telegram.qr");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const deepLink = `https://t.me/${botUsername}?start=${customerId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(deepLink);
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="mr-1.5 h-3.5 w-3.5" />
        {t("title")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">{t("title")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG value={deepLink} size={200} />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {t("description", { name: customerName })}
            </p>
            <div className="flex w-full gap-2">
              <Button variant="outline" onClick={handleCopy} className="flex-1">
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? t("copied") : t("copyLink")}
              </Button>
              {customerEmail && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const subject = encodeURIComponent(t("emailSubject"));
                    const body = encodeURIComponent(t("emailBody", { name: customerName, link: deepLink }));
                    window.open(`mailto:${customerEmail}?subject=${subject}&body=${body}`);
                  }}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {t("sendEmail")}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
