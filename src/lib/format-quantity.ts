/**
 * Render a part quantity with its unit of measure ("2.5 l", "4 pcs").
 *
 * The unit is a per-line snapshot taken from the inventory part at pick time;
 * lines without one (free text, legacy rows) render the bare number, which is
 * exactly what they did before units existed.
 */
export function formatQuantity(quantity: number, unit?: string | null): string {
  return unit ? `${quantity} ${unit}` : `${quantity}`
}
