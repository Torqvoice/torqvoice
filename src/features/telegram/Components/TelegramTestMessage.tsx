"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { testTelegramSend } from "../Actions/telegramSettingsActions";

export function TelegramTestMessage() {
  const t = useTranslations("telegram");
  const [isTesting, setIsTesting] = useState(false);
  const [testChatId, setTestChatId] = useState("");
  const [testMessage, setTestMessage] = useState("");

  const handleTestSend = async () => {
    if (!testChatId.trim() || !testMessage.trim()) return;
    setIsTesting(true);
    try {
      const result = await testTelegramSend({
        chatId: testChatId.trim(),
        message: testMessage.trim(),
      });
      if (result.success) {
        toast.success(t("test.success"));
      } else {
        toast.error(result.error ?? t("test.error"));
      }
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <Label className="text-base font-semibold">{t("test.title")}</Label>
      <div className="space-y-2">
        <Label htmlFor="test-chat-id">{t("test.chatId")}</Label>
        <Input
          id="test-chat-id"
          placeholder={t("test.chatIdPlaceholder")}
          value={testChatId}
          onChange={(e) => setTestChatId(e.target.value)}
          className="max-w-xs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="test-message">{t("test.message")}</Label>
        <Textarea
          id="test-message"
          placeholder={t("test.messagePlaceholder")}
          value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)}
          rows={3}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={handleTestSend}
        disabled={isTesting || !testChatId.trim() || !testMessage.trim()}
      >
        {isTesting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        {t("test.send")}
      </Button>
    </div>
  );
}
