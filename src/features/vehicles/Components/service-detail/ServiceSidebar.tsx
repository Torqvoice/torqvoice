"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Building2, Car, Mail, MapPin, Phone, Users } from "lucide-react";
import { CustomFieldsDisplay } from "@/features/custom-fields/Components/CustomFieldsDisplay";
import type { Vehicle } from "./types";

interface ServiceSidebarProps {
  recordId: string;
  vehicle: Vehicle;
  vehicleName: string;
  distUnit: string;
  mileage: number | null;
}

export function ServiceSidebar({
  recordId,
  vehicle,
  vehicleName,
  distUnit,
  mileage,
}: ServiceSidebarProps) {
  const t = useTranslations("service.sidebar");
  return (
    <>
      {/* Vehicle Info */}
      <div className="rounded-lg border p-3">
        <h3 className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Car className="h-3.5 w-3.5" />
          {t("vehicle")}
        </h3>
        <Link href={`/vehicles/${vehicle.id}`} className="text-sm font-semibold hover:underline">
          {vehicleName}
        </Link>
        {vehicle.licensePlate && (
          <p className="font-mono text-xs text-muted-foreground">{vehicle.licensePlate}</p>
        )}
        {vehicle.vin && (
          <p className="font-mono text-xs text-muted-foreground">{t("vin", { vin: vehicle.vin })}</p>
        )}
        {mileage && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("mileageAtService", { mileage: mileage.toLocaleString(), unit: distUnit })}
          </p>
        )}
      </div>

      {/* Customer Info */}
      {vehicle.customer && (
        <div className="rounded-lg border p-3">
          <h3 className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {t("customer")}
          </h3>
          <Link
            href={`/customers/${vehicle.customer.id}`}
            className="text-sm font-semibold hover:underline"
          >
            {vehicle.customer.name}
          </Link>
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {vehicle.customer.company && (
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3 shrink-0" />
                {vehicle.customer.company}
              </div>
            )}
            {vehicle.customer.email && (
              <div className="flex items-center gap-1.5">
                <Mail className="h-3 w-3 shrink-0" />
                {vehicle.customer.email}
              </div>
            )}
            {vehicle.customer.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 shrink-0" />
                {vehicle.customer.phone}
              </div>
            )}
            {vehicle.customer.address && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 shrink-0" />
                {vehicle.customer.address}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Fields */}
      <CustomFieldsDisplay entityId={recordId} entityType="service_record" />
    </>
  );
}
