"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations('settings');
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
          checked ? t('portal.enabled') : t('portal.disabled'),
        );
        router.refresh();
      } else {
        setEnabled(!checked);
        toast.error(result.error ?? t('portal.failedUpdate'));
      }
    });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    toast.success(t('portal.urlCopied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSlugSave = async () => {
    setSlugSaving(true);
    try {
      const result = await updatePortalSlug(slug || null);
      if (result.success) {
        toast.success(slug ? t('portal.slugSaved') : t('portal.slugRemoved'));
        router.refresh();
      } else {
        toast.error(result.error ?? t('portal.failedUpdateSlug'));
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
              {t('portal.title')}
            </CardTitle>
            <CardDescription>
              {t('portal.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="portal-enabled">{t('portal.enablePortal')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('portal.enablePortalHint')}
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
                  <Label htmlFor="portal-slug">{t('portal.customSlug')}</Label>
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
                        t('portal.save')
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('portal.slugHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{t('portal.portalUrl')}</Label>
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
                    {t('portal.shareHint')}
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
