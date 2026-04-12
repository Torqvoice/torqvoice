export type WarrantyStatus = "active" | "expiring" | "expired" | "none";

export function getWarrantyStatus(
  warrantyExpiresAt: Date | string | null | undefined,
  warrantyMileage: number | null | undefined,
  serviceMileage: number | null | undefined,
  currentVehicleMileage: number | null | undefined,
): WarrantyStatus {
  if (!warrantyExpiresAt) return "none";

  const now = new Date();
  const expires = new Date(warrantyExpiresAt);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Check if date-expired
  if (expires < now) return "expired";

  // Check if mileage-expired
  if (warrantyMileage && serviceMileage != null && currentVehicleMileage != null) {
    if (currentVehicleMileage > serviceMileage + warrantyMileage) return "expired";
  }

  // Check if expiring soon (within 30 days)
  if (expires < thirtyDaysFromNow) return "expiring";

  return "active";
}
