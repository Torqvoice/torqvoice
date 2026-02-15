"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGlassModal } from "@/components/glass-modal";
import { createServiceRecord } from "../Actions/serviceActions";
import { Loader2 } from "lucide-react";

interface ServiceFormProps {
  vehicleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServiceForm({
  vehicleId,
  open,
  onOpenChange,
}: ServiceFormProps) {
  const router = useRouter();
  const modal = useGlassModal();
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("maintenance");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await createServiceRecord({
      vehicleId,
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || undefined,
      type,
      cost: Number(formData.get("cost")) || 0,
      mileage: Number(formData.get("mileage")) || undefined,
      serviceDate:
        (formData.get("serviceDate") as string) || new Date().toISOString(),
      shopName: (formData.get("shopName") as string) || undefined,
      techName: (formData.get("techName") as string) || undefined,
      parts: (formData.get("parts") as string) || undefined,
      laborHours: Number(formData.get("laborHours")) || undefined,
    });

    if (result.success) {
      onOpenChange(false);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || "Failed to create record");
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Service Record</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              placeholder="Oil Change"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="upgrade">Upgrade</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceDate">Date</Label>
              <Input
                id="serviceDate"
                name="serviceDate"
                type="date"
                defaultValue={new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cost">Cost ($)</Label>
              <Input
                id="cost"
                name="cost"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mileage">Mileage</Label>
              <Input
                id="mileage"
                name="mileage"
                type="number"
                placeholder="50000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shopName">Shop Name</Label>
              <Input
                id="shopName"
                name="shopName"
                placeholder="Joe's Auto Shop"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="techName">Technician</Label>
              <Input
                id="techName"
                name="techName"
                placeholder="Mike"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="parts">Parts Used</Label>
            <Input
              id="parts"
              name="parts"
              placeholder="Oil filter, 5W-30 synthetic oil"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="laborHours">Labor Hours</Label>
            <Input
              id="laborHours"
              name="laborHours"
              type="number"
              step="0.5"
              placeholder="1.0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Notes</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Additional details..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Record
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
