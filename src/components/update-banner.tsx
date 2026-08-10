"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { markVersionSeen } from "@/features/users/Actions/versionActions";

/**
 * One-time "the app was updated" notice, shown when the running APP_VERSION
 * differs from the version stored on the user record. Dismissing (or opening
 * the release notes) stores the current version server-side, so the banner
 * appears exactly once per account per release, on any device.
 */
export function UpdateBanner({
  currentVersion,
  lastSeenVersion,
  releaseNotesUrl,
}: {
  currentVersion: string;
  lastSeenVersion: string | null;
  releaseNotesUrl: string;
}) {
  const t = useTranslations("common.updateBanner");
  const [dismissed, setDismissed] = useState(false);

  const neverSeeded = lastSeenVersion === null;
  const show =
    !dismissed &&
    !neverSeeded &&
    currentVersion !== "development" &&
    lastSeenVersion !== currentVersion;

  // First load ever for this account: seed silently so a brand-new user is
  // not greeted with "what's new" for a version they never used.
  useEffect(() => {
    if (neverSeeded && currentVersion !== "development") {
      markVersionSeen(currentVersion);
    }
  }, [neverSeeded, currentVersion]);

  if (!show) return null;

  const acknowledge = () => {
    setDismissed(true);
    markVersionSeen(currentVersion);
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-primary/5 px-4 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">{t("updated", { version: currentVersion })}</span>
        <a
          href={releaseNotesUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={acknowledge}
          className="shrink-0 font-medium text-primary underline-offset-2 hover:underline"
        >
          {t("whatsNew")}
        </a>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={acknowledge}
      >
        <X className="h-3.5 w-3.5" />
        <span className="sr-only">{t("dismiss")}</span>
      </Button>
    </div>
  );
}
