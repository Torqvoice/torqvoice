"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { VehiclePickerDialog } from "@/components/vehicle-picker-dialog";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { getCustomersList } from "@/features/customers/Actions/customerActions";

interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customer: { id: string; name: string; company: string | null } | null;
}

interface CustomerOption {
  id: string;
  name: string;
  company: string | null;
}

export function NewWorkOrderButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  const handleClick = async () => {
    setLoading(true);
    try {
      const [vehiclesResult, customersResult] = await Promise.all([
        getVehicles(),
        getCustomersList(),
      ]);
      setVehicles(
        vehiclesResult.success && vehiclesResult.data
          ? vehiclesResult.data.map((v) => ({
              id: v.id,
              make: v.make,
              model: v.model,
              year: v.year,
              licensePlate: v.licensePlate,
              customer: v.customer,
            }))
          : []
      );
      setCustomers(
        customersResult.success && customersResult.data
          ? customersResult.data
          : []
      );
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={handleClick} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="mr-1 h-3.5 w-3.5" />
        )}
        New Work Order
      </Button>
      <VehiclePickerDialog
        open={open}
        onOpenChange={setOpen}
        vehicles={vehicles}
        customers={customers}
      />
    </>
  );
}
