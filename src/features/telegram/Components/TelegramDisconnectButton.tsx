"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { disconnectTelegram } from "../Actions/telegramSettingsActions";

export function TelegramDisconnectButton() {
  const t = useTranslations("telegram");
  const tc = useTranslations("common.buttons");
  const router = useRouter();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    const result = await disconnectTelegram();
    if (result.success) {
      toast.success(t("disconnect.success"));
      router.refresh();
    } else {
      toast.error(result.error ?? t("disconnect.error"));
    }
    setIsDisconnecting(false);
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          {t("disconnect.button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("disconnect.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("disconnect.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDisconnecting}>
            {tc("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDisconnecting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t("disconnect.button")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
