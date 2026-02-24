"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Copy, Check, Globe, Loader2 } from "lucide-react";
import {
  ReadOnlyBanner,
  SaveButton,
  ReadOnlyWrapper,
} from "@/app/(authenticated)/settings/read-only-guard";
import { setSetting } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { updatePortalSlug } from "@/features/portal/Actions/portalActions";

export function CustomerPortalSettings({
  enabled: initialEnabled,
  orgId,
  portalSlug: initialSlug,
  appUrl,
}: {
  enabled: boolean;
  orgId: string;
  portalSlug: string | null;
  appUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [copied, setCopied] = useState(false);
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [slugSaving, setSlugSaving] = useState(false);

  const portalParam = slug || orgId;
  const portalUrl = `${appUrl}/portal/${portalParam}`;

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    startTransition(async () => {
      const result = await setSetting(
        SETTING_KEYS.PORTAL_ENABLED,
        checked ? "true" : "false",
      );
      if (result.success) {
        toast.success(
          checked ? "Customer portal enabled" : "Customer portal disabled",
        );
        router.refresh();
      } else {
        setEnabled(!checked);
        toast.error(result.error ?? "Failed to update setting");
      }
    });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    toast.success("Portal URL copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSlugSave = async () => {
    setSlugSaving(true);
    try {
      const result = await updatePortalSlug(slug || null);
      if (result.success) {
        toast.success(slug ? "Portal slug saved" : "Portal slug removed");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to update slug");
      }
    } finally {
      setSlugSaving(false);
    }
  };

  const slugDirty = slug !== (initialSlug ?? "");

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Customer Portal
            </CardTitle>
            <CardDescription>
              Allow your customers to log in and view their vehicles, invoices,
              quotes, and inspections. Customers can also submit service
              requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="portal-enabled">Enable customer portal</Label>
                <p className="text-xs text-muted-foreground">
                  Customers with an email address can log in via magic link
                </p>
              </div>
              <Switch
                id="portal-enabled"
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={isPending}
              />
            </div>

            {enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="portal-slug">Custom portal slug</Label>
                  <div className="flex gap-2">
                    <Input
                      id="portal-slug"
                      value={slug}
                      onChange={(e) =>
                        setSlug(e.target.value.toLowerCase().replace(/\s/g, ""))
                      }
                      placeholder="e.g. my_shop"
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      onClick={handleSlugSave}
                      disabled={slugSaving || !slugDirty}
                      size="sm"
                    >
                      {slugSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters, numbers, hyphens, and underscores. 3–48
                    characters. Leave blank to use the default URL.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Portal URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={portalUrl}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share this link with your customers so they can log in to
                    their portal.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </ReadOnlyWrapper>
    </div>
  );
}
