"use client";

import Link from "next/link";
import { MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function SmsNotConfiguredMessage() {
  const t = useTranslations("messages.notConfigured");

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
        <MessageSquare className="h-6 w-6 text-blue-600" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{t("title")}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {t("description")}
      </p>
      <Button asChild className="mt-4" size="sm">
        <Link href="/settings/sms">
          {t("goToSettings")}
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
