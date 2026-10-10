/**
 * Money is held to the cent, so every derived amount rounds the same way.
 *
 * Binary floats cannot represent most decimal amounts exactly, so a bare
 * `cost * 1.5` yields values like 44.980000000000004. Left unrounded those
 * reach the database and are summed into subtotals, where the error compounds
 * into a visible penny discrepancy on the document.
 */
export function roundMoney(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  // Round on the decimal value, not the binary approximation of it. A plain
  // Math.round(v * 100) / 100 bills 2.5 x 19.99 as 49.97, because that product
  // is held as 49.974999999999994 and so falls just short of the halfway point
  // it should sit exactly on. The same flaw rounds 1.005 down to 1.00.
  //
  // Twelve significant digits is well past where the noise lives and well
  // short of the ~15 a double carries, so this restores the decimal figure
  // without inventing precision. Rounding is symmetric about zero, so a credit
  // line rounds by the same magnitude as the charge it reverses.
  const normalized = Number(parsed.toPrecision(12))
  const scaled = Number((normalized * 100).toPrecision(12))
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / 100
}

/** Two decimals, rounded the way the formatter behind every printed amount rounds. */
const PRINTED = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
})

/**
 * A stored amount to two decimals exactly as the documents print it.
 *
 * roundMoney above decides what a new figure should be. This answers a
 * different question: what does the sheet show for a figure that is already
 * stored? Totals written before they were held to the cent sit a hair off
 * half a cent (0.18 plus 25% was stored as 0.22499999999999998), and the
 * formatter prints that as 0.22 where arithmetic says 0.23. Anything that
 * passes an invoice on, to a ledger or a payment, has to carry the printed
 * figure, because that is the one the customer holds and pays.
 */
export function roundAsPrinted(amount: number): number {
  return Number(PRINTED.format(amount))
}
