"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import { createInspection } from "../Actions/inspectionActions";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";

interface TemplateOption {
  id: string;
  name: string;
  isDefault: boolean;
}

interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
}

export function NewInspectionDialog({
  open,
  onOpenChange,
  templates,
  preselectedVehicleId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: TemplateOption[];
  preselectedVehicleId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  const defaultTemplate = templates.find((t) => t.isDefault);
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId || "");
  const [templateId, setTemplateId] = useState(defaultTemplate?.id || "");
  const [mileage, setMileage] = useState("");
  const [vehiclePopoverOpen, setVehiclePopoverOpen] = useState(false);

  useEffect(() => {
    if (open && vehicles.length === 0) {
      setLoadingVehicles(true);
      getVehicles().then((result) => {
        if (result.success && result.data) {
          setVehicles(result.data.map((v) => ({
            id: v.id,
            make: v.make,
            model: v.model,
            year: v.year,
            licensePlate: v.licensePlate,
          })));
        }
        setLoadingVehicles(false);
      });
    }
  }, [open, vehicles.length]);

  useEffect(() => {
    if (open) {
      setVehicleId(preselectedVehicleId || "");
      setTemplateId(defaultTemplate?.id || "");
      setMileage("");
    }
  }, [open, preselectedVehicleId, defaultTemplate?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await createInspection({
        vehicleId,
        templateId,
        mileage: mileage ? parseInt(mileage, 10) : undefined,
      });

      if (result.success && result.data) {
        toast.success("Inspection created");
        onOpenChange(false);
        router.push(`/inspections/${result.data.id}`);
      } else {
        toast.error(result.error || "Failed to create inspection");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Inspection</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Vehicle</Label>
            {loadingVehicles ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading vehicles...
              </div>
            ) : (
              <Popover open={vehiclePopoverOpen} onOpenChange={setVehiclePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={vehiclePopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    {vehicleId
                      ? (() => {
                          const v = vehicles.find((v) => v.id === vehicleId);
                          return v
                            ? `${v.year} ${v.make} ${v.model}${v.licensePlate ? ` (${v.licensePlate})` : ""}`
                            : "Select vehicle";
                        })()
                      : "Select vehicle"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search vehicles..." />
                    <CommandList>
                      <CommandEmpty>No vehicles found.</CommandEmpty>
                      <CommandGroup>
                        {vehicles.map((v) => {
                          const label = `${v.year} ${v.make} ${v.model}${v.licensePlate ? ` (${v.licensePlate})` : ""}`;
                          return (
                            <CommandItem
                              key={v.id}
                              value={label}
                              onSelect={() => {
                                setVehicleId(v.id);
                                setVehiclePopoverOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", vehicleId === v.id ? "opacity-100" : "opacity-0")} />
                              {label}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Template</Label>
              <Link
                href="/settings/templates?tab=inspection"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onOpenChange(false)}
              >
                <Settings className="h-3 w-3" />
                Manage templates
              </Link>
            </div>
            <Select value={templateId} onValueChange={setTemplateId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? " (Default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Mileage (optional)</Label>
            <Input
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="Current mileage"
              min={0}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !vehicleId || !templateId}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Inspection
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
