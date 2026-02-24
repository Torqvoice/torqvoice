"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
  const [preferredDate, setPreferredDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!vehicleId) {
      toast.error("Please select a vehicle");
      return;
    }

    if (!description.trim()) {
      toast.error("Please describe the issue");
      return;
    }

    startTransition(async () => {
      const result = await createServiceRequest({
        vehicleId,
        description: description.trim(),
        preferredDate: preferredDate || undefined,
      });

      if (result.success) {
        toast.success("Service request submitted");
        router.push(`/portal/${orgId}/dashboard`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to submit request");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Service Request</CardTitle>
        <CardDescription>
          Describe the issue and we&apos;ll get back to you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vehicle">Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="vehicle">
                <SelectValue placeholder="Select a vehicle" />
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
            <Label htmlFor="description">Describe the issue</Label>
            <Textarea
              id="description"
              placeholder="What's going on with your vehicle?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preferred-date">
              Preferred date{" "}
              <span className="text-muted-foreground">(optional)</span>
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
              Submit Request
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
