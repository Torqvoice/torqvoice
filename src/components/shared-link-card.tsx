"use client";

import { useState } from "react";
import { Link2, Copy, Check, Trash2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface SharedLinkCardProps {
  publicToken: string;
  organizationId: string;
  type: "quote" | "invoice";
  sharedAt: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
  onRevoke?: () => Promise<void>;
}

export function SharedLinkCard({
  publicToken,
  organizationId,
  type,
  sharedAt,
  viewCount,
  lastViewedAt,
  onRevoke,
}: SharedLinkCardProps) {
  const t = useTranslations(type === "quote" ? "quotes" : "service");
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${type === "quote" ? "quote" : "invoice"}/${organizationId}/${publicToken}`
      : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  };

  const handleRevoke = async () => {
    if (!onRevoke) return;
    setRevoking(true);
    try {
      await onRevoke();
    } finally {
      setRevoking(false);
    }
  };

  const hasViews = viewCount > 0;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="flex-1 text-sm font-semibold">{t("sidebar.sharedLink.title")}</h3>
        {onRevoke && (
          <button
            type="button"
            onClick={handleRevoke}
            disabled={revoking}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            {revoking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Public URL with copy */}
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1 truncate rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
          {publicUrl}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Shared date */}
      {sharedAt && (
        <p className="text-xs text-muted-foreground">
          {t("sidebar.sharedLink.sharedOn", {
            date: new Date(sharedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          })}
        </p>
      )}

      {/* View status */}
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            hasViews ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
          }`}
        />
        {hasViews ? (
          <span className="text-xs text-muted-foreground">
            {t("sidebar.sharedLink.viewedTimes", { count: viewCount })}
            {lastViewedAt && (
              <>
                {" · "}
                {t("sidebar.sharedLink.lastViewed", {
                  date: new Date(lastViewedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </>
            )}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("sidebar.sharedLink.notViewed")}
          </span>
        )}
      </div>
    </div>
  );
}
