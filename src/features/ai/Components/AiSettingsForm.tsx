"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Loader2, Sparkles, Zap } from "lucide-react";
import {
  AI_KEYS,
  AI_PROVIDERS,
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  type AiProvider,
} from "../Schema/aiSettingsSchema";
import { setAiSettings } from "../Actions/aiSettingsActions";
import { aiTestConnection } from "../Actions/aiActions";
import {
  ReadOnlyBanner,
  SaveButton,
  ReadOnlyWrapper,
} from "@/app/(authenticated)/settings/read-only-guard";

export function AiSettingsForm({
  initial,
}: {
  initial: Record<string, string>;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);

  const hasConfig = !!initial[AI_KEYS.AI_API_KEY];
  const [enabled, setEnabled] = useState(
    initial[AI_KEYS.AI_ENABLED] === "true" || false,
  );
  const [provider, setProvider] = useState<AiProvider>(
    (initial[AI_KEYS.AI_PROVIDER] as AiProvider) || "openai",
  );
  const [apiKey, setApiKey] = useState(initial[AI_KEYS.AI_API_KEY] || "");
  const [model, setModel] = useState(
    initial[AI_KEYS.AI_MODEL] || "gpt-4o-mini",
  );

  const models = provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;

  const handleProviderChange = (value: string) => {
    const p = value as AiProvider;
    setProvider(p);
    // Reset model to first option of new provider
    if (p === "anthropic") {
      setModel(ANTHROPIC_MODELS[0].id);
    } else {
      setModel(OPENAI_MODELS[1].id); // gpt-4o-mini as default
    }
  };

  const handleSave = () => {
    startTransition(async () => {
      const data: Record<string, string> = {
        [AI_KEYS.AI_ENABLED]: enabled ? "true" : "false",
        [AI_KEYS.AI_PROVIDER]: provider,
        [AI_KEYS.AI_API_KEY]: apiKey,
        [AI_KEYS.AI_MODEL]: model,
      };

      const result = await setAiSettings(data);
      if (result.success) {
        toast.success(t("ai.saved"));
        router.refresh();
      } else {
        toast.error(result.error ?? t("ai.failedSave"));
      }
    });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const result = await aiTestConnection();
      if (result.success && result.data) {
        toast.success(t("ai.testSuccess"));
      } else {
        toast.error(result.error ?? t("ai.testFailed"));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("ai.testFailed"),
      );
    } finally {
      setIsTesting(false);
    }
  };

  const canTest = enabled && apiKey && model;

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {t("ai.title")}
            </CardTitle>
            <CardDescription>{t("ai.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable-ai">{t("ai.enableLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("ai.enableHint")}
                </p>
              </div>
              <Switch
                id="enable-ai"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>

            {!enabled && (
              <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("ai.disabledInfo")}
                </p>
              </div>
            )}

            {enabled && (
              <>
                {/* Provider selection */}
                <div className="space-y-2">
                  <Label>{t("ai.provider")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {AI_PROVIDERS.map((p) => (
                      <Button
                        key={p}
                        type="button"
                        variant={provider === p ? "default" : "outline"}
                        onClick={() => handleProviderChange(p)}
                        className="flex-1"
                      >
                        {p === "openai" ? "OpenAI" : "Anthropic"}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                  <Label htmlFor="ai-api-key">{t("ai.apiKey")}</Label>
                  <Input
                    id="ai-api-key"
                    type="password"
                    placeholder={
                      provider === "openai"
                        ? "sk-••••••••••••••••••••••••••••••••"
                        : "sk-ant-••••••••••••••••••••••••••"
                    }
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("ai.apiKeyHint", {
                      provider: provider === "openai" ? "OpenAI" : "Anthropic",
                    })}
                  </p>
                </div>

                {/* Model selection */}
                <div className="space-y-2">
                  <Label htmlFor="ai-model">{t("ai.model")}</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Test connection */}
                {hasConfig && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={!canTest || isTesting}
                    >
                      {isTesting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="mr-2 h-4 w-4" />
                      )}
                      {t("ai.testConnection")}
                    </Button>
                  </div>
                )}

                {/* Features info */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <p className="text-sm font-medium">{t("ai.featuresTitle")}</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• {t("ai.featureServiceNotes")}</li>
                    <li>• {t("ai.featureHistorySummary")}</li>
                    <li>• {t("ai.featureQuoteBuilder")}</li>
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <SaveButton>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("ai.saveSettings")}
            </Button>
          </div>
        </SaveButton>
      </ReadOnlyWrapper>
    </div>
  );
}
