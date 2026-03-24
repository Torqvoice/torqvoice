"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Car, Anchor } from "lucide-react";

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
        <Select value={serviceType || "automotive"} onValueChange={onServiceTypeChange}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="automotive">
              <span className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                {t("company.automotive")}
              </span>
            </SelectItem>
            <SelectItem value="boat">
              <span className="flex items-center gap-2">
                <Anchor className="h-4 w-4" />
                {t("company.boatService")}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
