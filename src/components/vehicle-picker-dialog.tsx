"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Loader2,
  Plus,
  Car,
  Search,
  ArrowLeft,
  UserPlus,
} from "lucide-react";
import { createVehicle } from "@/features/vehicles/Actions/vehicleActions";
import { createCustomer } from "@/features/customers/Actions/customerActions";
import { toast } from "sonner";

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customer: { id: string; name: string; company: string | null } | null;
}

interface Customer {
  id: string;
  name: string;
  company: string | null;
}

interface VehiclePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: Vehicle[];
  customers: Customer[];
  title?: string;
}

export function VehiclePickerDialog({
  open,
  onOpenChange,
  vehicles,
  customers,
  title = "Select Vehicle for Work Order",
}: VehiclePickerDialogProps) {
  const router = useRouter();

  const [vehicleSearch, setVehicleSearch] = useState("");
  const [pickerStep, setPickerStep] = useState<"select" | "create">("select");

  const [newMake, setNewMake] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newPlate, setNewPlate] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [creating, setCreating] = useState(false);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch.trim()) return vehicles;
    const q = vehicleSearch.toLowerCase();
    return vehicles.filter(
      (v) =>
        `${v.year} ${v.make} ${v.model}`.toLowerCase().includes(q) ||
        v.licensePlate?.toLowerCase().includes(q) ||
        v.customer?.name.toLowerCase().includes(q)
    );
  }, [vehicles, vehicleSearch]);

  const resetState = () => {
    setPickerStep("select");
    setVehicleSearch("");
    setNewMake("");
    setNewModel("");
    setNewYear("");
    setNewPlate("");
    setSelectedCustomerId("");
    setShowNewCustomer(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setCreating(false);
  };

  const handleSelect = (vehicleId: string) => {
    onOpenChange(false);
    resetState();
    router.push(`/vehicles/${vehicleId}/service/new`);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) resetState();
  };

  const handleQuickCreate = async () => {
    if (!newMake.trim() || !newModel.trim() || !newYear.trim()) return;
    const yearNum = parseInt(newYear, 10);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 2) {
      toast.error("Please enter a valid year");
      return;
    }
    if (showNewCustomer && !newCustomerName.trim()) {
      toast.error("Customer name is required");
      return;
    }

    setCreating(true);
    try {
      let customerId = selectedCustomerId || undefined;

      if (showNewCustomer && newCustomerName.trim()) {
        const customerResult = await createCustomer({
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || undefined,
        });
        if (!customerResult.success || !customerResult.data) {
          toast.error(customerResult.error || "Failed to create customer");
          setCreating(false);
          return;
        }
        customerId = customerResult.data.id;
      }

      const vehicleResult = await createVehicle({
        make: newMake.trim(),
        model: newModel.trim(),
        year: yearNum,
        licensePlate: newPlate.trim() || undefined,
        customerId,
      });
      if (!vehicleResult.success || !vehicleResult.data) {
        toast.error(vehicleResult.error || "Failed to create vehicle");
        setCreating(false);
        return;
      }

      handleSelect(vehicleResult.data.id);
    } catch {
      toast.error("Something went wrong");
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {pickerStep === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search vehicles..."
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {filteredVehicles.length === 0 ? (
                  <div className="py-6 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {vehicles.length === 0
                        ? "No vehicles found."
                        : "No vehicles match your search."}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setPickerStep("create")}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add New Vehicle
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredVehicles.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted"
                        onClick={() => handleSelect(v.id)}
                      >
                        <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {v.year} {v.make} {v.model}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[v.licensePlate, v.customer?.name]
                              .filter(Boolean)
                              .join(" · ") || "No plate"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setPickerStep("create")}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add New Vehicle
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setPickerStep("select")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle>Add New Vehicle</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-make">Make *</Label>
                  <Input
                    id="new-make"
                    placeholder="e.g. Toyota"
                    value={newMake}
                    onChange={(e) => setNewMake(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-model">Model *</Label>
                  <Input
                    id="new-model"
                    placeholder="e.g. Camry"
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-year">Year *</Label>
                  <Input
                    id="new-year"
                    type="number"
                    placeholder={`e.g. ${new Date().getFullYear()}`}
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-plate">License Plate</Label>
                  <Input
                    id="new-plate"
                    placeholder="e.g. ABC-1234"
                    value={newPlate}
                    onChange={(e) => setNewPlate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Customer</Label>
                {!showNewCustomer ? (
                  <Select
                    value={selectedCustomerId}
                    onValueChange={(val) => {
                      if (val === "__new__") {
                        setShowNewCustomer(true);
                        setSelectedCustomerId("");
                      } else {
                        setSelectedCustomerId(val);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a customer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">
                        <span className="flex items-center gap-1.5">
                          <UserPlus className="h-3.5 w-3.5" />
                          Create new customer
                        </span>
                      </SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.company ? ` (${c.company})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">New Customer</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setShowNewCustomer(false);
                          setNewCustomerName("");
                          setNewCustomerPhone("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="new-customer-name">Name *</Label>
                        <Input
                          id="new-customer-name"
                          placeholder="Customer name"
                          value={newCustomerName}
                          onChange={(e) => setNewCustomerName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-customer-phone">Phone</Label>
                        <Input
                          id="new-customer-phone"
                          placeholder="Phone number"
                          value={newCustomerPhone}
                          onChange={(e) => setNewCustomerPhone(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <Button
                className="w-full"
                disabled={creating || !newMake.trim() || !newModel.trim() || !newYear.trim() || (showNewCustomer && !newCustomerName.trim())}
                onClick={handleQuickCreate}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create & Continue"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
