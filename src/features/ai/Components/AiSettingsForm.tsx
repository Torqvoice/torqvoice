"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  OPENAI_FALLBACK_MODELS,
  ANTHROPIC_FALLBACK_MODELS,
  type AiProvider,
  type AiModel,
} from "../Schema/aiSettingsSchema";
import { setAiSettings, fetchAiModels } from "../Actions/aiSettingsActions";
import { aiTestConnection } from "../Actions/aiActions";
import {
  ReadOnlyBanner,
  SaveButton,
  ReadOnlyWrapper,
} from "@/app/(authenticated)/settings/read-only-guard";

const COST_COLORS: Record<AiModel["cost"], string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

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

  const [models, setModels] = useState<AiModel[]>(
    provider === "anthropic" ? ANTHROPIC_FALLBACK_MODELS : OPENAI_FALLBACK_MODELS,
  );
  const [fetchingModels, setFetchingModels] = useState(false);

  const loadModels = useCallback(async (p: AiProvider, key: string) => {
    if (!key) {
      setModels(p === "anthropic" ? ANTHROPIC_FALLBACK_MODELS : OPENAI_FALLBACK_MODELS);
      return;
    }
    setFetchingModels(true);
    try {
      const result = await fetchAiModels(p, key);
      if (result.success && result.data && result.data.length > 0) {
        setModels(result.data);
      } else {
        setModels(p === "anthropic" ? ANTHROPIC_FALLBACK_MODELS : OPENAI_FALLBACK_MODELS);
      }
    } catch {
      setModels(p === "anthropic" ? ANTHROPIC_FALLBACK_MODELS : OPENAI_FALLBACK_MODELS);
    } finally {
      setFetchingModels(false);
    }
  }, []);

  // Fetch models on mount if we have an API key
  useEffect(() => {
    if (apiKey) {
      loadModels(provider, apiKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProviderChange = (value: string) => {
    const p = value as AiProvider;
    setProvider(p);
    const fallback = p === "anthropic" ? ANTHROPIC_FALLBACK_MODELS : OPENAI_FALLBACK_MODELS;
    setModels(fallback);
    setModel(fallback[0].id);
    if (apiKey) {
      loadModels(p, apiKey);
    }
  };

  const handleApiKeyBlur = () => {
    if (apiKey) {
      loadModels(provider, apiKey);
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
                    onBlur={handleApiKeyBlur}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("ai.apiKeyHint", {
                      provider: provider === "openai" ? "OpenAI" : "Anthropic",
                    })}
                  </p>
                </div>

                {/* Model selection */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="ai-model">{t("ai.model")}</Label>
                    {fetchingModels && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span className="flex items-center gap-2">
                            {m.label}
                            <Badge
                              variant="outline"
                              className={`ml-1 text-[10px] px-1.5 py-0 font-medium ${COST_COLORS[m.cost]}`}
                            >
                              {t(`ai.cost.${m.cost}`)}
                            </Badge>
                          </span>
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
