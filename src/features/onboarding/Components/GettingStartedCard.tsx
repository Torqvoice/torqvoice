"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AppCard } from "@/components/app-card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/confirm-dialog";
import {
  ArrowRight,
  Car,
  Check,
  ClipboardList,
  FileText,
  Loader2,
  PartyPopper,
  Rocket,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  dismissOnboardingChecklist,
  removeSampleData,
  type OnboardingChecklistData,
} from "../Actions/checklistActions";

const STEPS = [
  { key: "customer", href: "/customers", icon: UserPlus },
  { key: "vehicle", href: "/vehicles", icon: Car },
  { key: "workOrder", href: "/work-orders", icon: ClipboardList },
  { key: "invoice", href: "/work-orders", icon: FileText },
] as const;

export function GettingStartedCard({ data }: { data: OnboardingChecklistData }) {
  const t = useTranslations("onboarding.checklist");
  const tSample = useTranslations("onboarding.sampleData");
  const router = useRouter();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();
  const [removing, setRemoving] = useState(false);

  const doneCount = STEPS.filter((s) => data.steps[s.key]).length;

  const handleDismiss = () => {
    startTransition(async () => {
      await dismissOnboardingChecklist();
      router.refresh();
    });
  };

  const handleRemoveSampleData = async () => {
    const ok = await confirm({
      title: tSample("removeConfirmTitle"),
      description: tSample("removeConfirmDescription"),
      confirmLabel: tSample("remove"),
      destructive: true,
    });
    if (!ok) return;
    setRemoving(true);
    const result = await removeSampleData();
    setRemoving(false);
    if (result.success) {
      toast.success(tSample("removed"));
      router.refresh();
    } else {
      toast.error(result.error || tSample("removeFailed"));
    }
  };

  return (
    <AppCard
      icon={Rocket}
      title={t("title")}
      description={t("description")}
      badge={t("progress", { done: doneCount, total: STEPS.length })}
      action={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
              aria-label={t("dismissAriaLabel")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("dismissAriaLabel")}</TooltipContent>
        </Tooltip>
      }
      contentClassName="p-0"
      footer={
        data.hasSampleData ? (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="min-w-0 truncate">{tSample("footerNote")}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 text-xs text-muted-foreground hover:text-destructive"
              onClick={handleRemoveSampleData}
              disabled={removing}
            >
              {removing ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" />
              )}
              {tSample("remove")}
            </Button>
          </div>
        ) : undefined
      }
    >
      {data.allDone ? (
        <div className="flex flex-col items-center gap-3 px-5 py-6 text-center sm:flex-row sm:text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <PartyPopper className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("allDoneTitle")}</p>
            <p className="text-xs text-muted-foreground">
              {t("allDoneDescription")}
            </p>
          </div>
          <Button size="sm" className="h-8 shrink-0 text-xs" onClick={handleDismiss}>
            <Check className="mr-1 h-3.5 w-3.5" />
            {t("dismiss")}
          </Button>
        </div>
      ) : (
        <div className="divide-y">
          {STEPS.map(({ key, href, icon: Icon }) => {
            const done = data.steps[key];
            return (
              <Link
                key={key}
                href={href}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      done ? "bg-emerald-500/10" : "bg-primary/10"
                    }`}
                  >
                    {done ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Icon className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`truncate text-sm font-medium ${
                        done ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {t(`steps.${key}.title`)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(`steps.${key}.description`)}
                    </p>
                  </div>
                </div>
                {!done && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </AppCard>
  );
}
