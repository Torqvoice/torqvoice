"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, Anchor } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceTypeSelectorProps {
  serviceType: string;
  onServiceTypeChange: (value: string) => void;
}

export function ServiceTypeSelector({ serviceType, onServiceTypeChange }: ServiceTypeSelectorProps) {
  const t = useTranslations("settings");

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">
          {t("company.serviceType")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("company.serviceTypeDescription")}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onServiceTypeChange("automotive")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/50",
              serviceType === "automotive"
                ? "border-primary bg-primary/5"
                : "border-border"
            )}
          >
            <Car className="h-6 w-6" />
            <span className="text-sm font-medium">{t("company.automotive")}</span>
          </button>
          <button
            type="button"
            onClick={() => onServiceTypeChange("boat")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/50",
              serviceType === "boat"
                ? "border-primary bg-primary/5"
                : "border-border"
            )}
          >
            <Anchor className="h-6 w-6" />
            <span className="text-sm font-medium">{t("company.boatService")}</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
