"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { Loader2 } from "lucide-react";
import { createServiceRequest } from "@/features/portal/Actions/portalActions";

type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
};

export function ServiceRequestForm({
  orgId,
  vehicles,
}: {
  orgId: string;
  vehicles: Vehicle[];
}) {
  const t = useTranslations("portal.requestService");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
  const [preferredDate, setPreferredDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!vehicleId) {
      toast.error(t("selectVehicle"));
      return;
    }

    if (!description.trim()) {
      toast.error(t("describeIssue"));
      return;
    }

    startTransition(async () => {
      const result = await createServiceRequest({
        vehicleId,
        description: description.trim(),
        preferredDate: preferredDate || undefined,
      });

      if (result.success) {
        toast.success(t("submitSuccess"));
        setDescription("");
        setPreferredDate("");
        setVehicleId("");
        router.refresh();
      } else {
        toast.error(result.error ?? t("submitError"));
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("newServiceRequest")}</CardTitle>
        <CardDescription>
          {t("formDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vehicle">{t("vehicleLabel")}</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="vehicle">
                <SelectValue placeholder={t("vehiclePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.year} {v.make} {v.model}
                    {v.licensePlate ? ` (${v.licensePlate})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("descriptionLabel")}</Label>
            <Textarea
              id="description"
              placeholder={t("descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preferred-date">
              {t("preferredDate")}{" "}
              <span className="text-muted-foreground">{t("preferredDateOptional")}</span>
            </Label>
            <Input
              id="preferred-date"
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("submitRequest")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
