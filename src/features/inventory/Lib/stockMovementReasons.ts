/**
 * Reasons the UI offers as history filters. Mirrors `StockMovementReason` in
 * ./reconcileStock and the values persisted in `StockMovement.reason`.
 *
 * Kept in a plain module rather than alongside the server actions: a
 * `"use server"` file may only export async functions, so a const array there
 * breaks the build.
 */
export const STOCK_MOVEMENT_REASONS = [
  "service_record",
  "service_record_deleted",
  "quote_conversion",
  "manual_adjustment",
  "bulk_markup",
] as const;
