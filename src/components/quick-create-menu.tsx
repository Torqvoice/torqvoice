"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Loader2,
  Wrench,
  Users,
  Car,
  FileText,
  Package,
  ClipboardCheck,
} from "lucide-react";
import { VehiclePickerDialog } from "@/components/vehicle-picker-dialog";
import { NewInspectionDialog } from "@/features/inspections/Components/NewInspectionDialog";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { getCustomersList } from "@/features/customers/Actions/customerActions";
import { getTemplates } from "@/features/inspections/Actions/templateActions";

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

interface TemplateOption {
  id: string;
  name: string;
  isDefault: boolean;
}

export function QuickCreateMenu() {
  const t = useTranslations("navigation");
  const router = useRouter();
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);

  const handleNewWorkOrder = async () => {
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
      setVehicleDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleNewInspection = async () => {
    setLoading(true);
    try {
      const result = await getTemplates();
      setTemplates(
        result.success && result.data
          ? result.data.map((t) => ({
              id: t.id,
              name: t.name,
              isDefault: t.isDefault,
            }))
          : []
      );
      setInspectionDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3.5 w-3.5" />
            )}
            {t("quickCreate.title")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>{t("quickCreate.title")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleNewWorkOrder}>
            <Wrench className="h-4 w-4" />
            {t("quickCreate.workOrder")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/customers?create=true")}>
            <Users className="h-4 w-4" />
            {t("quickCreate.customer")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/vehicles?create=true")}>
            <Car className="h-4 w-4" />
            {t("quickCreate.vehicle")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/quotes?create=true")}>
            <FileText className="h-4 w-4" />
            {t("quickCreate.quote")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/inventory?create=true")}>
            <Package className="h-4 w-4" />
            {t("quickCreate.part")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleNewInspection}>
            <ClipboardCheck className="h-4 w-4" />
            {t("quickCreate.inspection")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <VehiclePickerDialog
        open={vehicleDialogOpen}
        onOpenChange={setVehicleDialogOpen}
        vehicles={vehicles}
        customers={customers}
      />
      <NewInspectionDialog
        open={inspectionDialogOpen}
        onOpenChange={setInspectionDialogOpen}
        templates={templates}
      />
    </>
  );
}
