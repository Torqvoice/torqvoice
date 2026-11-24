/** The oldest model year a vehicle can be saved with. */
export const VEHICLE_YEAR_MIN = 1900

/** The newest: next year's models are sold this year, and the one after is announced. */
export function vehicleYearMax(): number {
  return new Date().getFullYear() + 2
}
