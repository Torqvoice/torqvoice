/**
 * A plan's price is stored per billing interval, not per month. Most plans bill
 * yearly, so summing prices straight out of the table and calling the result
 * monthly revenue overstates it by a factor of twelve.
 */
export function monthlyPlanPrice(price: number, interval: string | null | undefined): number {
  if (!Number.isFinite(price)) return 0

  switch ((interval ?? 'month').toLowerCase()) {
    case 'year':
    case 'yearly':
    case 'annual':
      return price / 12
    case 'quarter':
    case 'quarterly':
      return price / 3
    case 'week':
    case 'weekly':
      return (price * 52) / 12
    default:
      return price
  }
}
