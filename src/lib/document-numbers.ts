import { formatQuantity } from './format-quantity'

/**
 * Numbers as a printed document writes them, in the document's language:
 * "86 200 km" and "0,8 h" on a French invoice, "86,200 km" and "0.8 h" on an
 * English one. The documents were written English-style whatever their
 * language, because the numbers went through `toLocaleString()` and `String()`
 * with no locale.
 *
 * Without a locale every number is written exactly as before, so a caller
 * that does not know the document's language changes nothing.
 */
export interface DocumentNumbers {
  /** Hours and other counts: the decimal mark only, never grouped. */
  count(value: number): string
  /** Mileage and engine hours on the odometer: grouped, whole. */
  distance(value: number): string
  /** A part's quantity with its unit, "2,5 l". */
  quantity(value: number, unit?: string | null): string
}

/**
 * The narrow no-break space French and others group with is missing from the
 * standard PDF fonts; the ordinary no-break space prints the same gap.
 */
function printable(text: string): string {
  return text.replace(/ /g, ' ')
}

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat | null {
  try {
    return new Intl.NumberFormat(locale, options)
  } catch {
    return null
  }
}

export function documentNumbers(locale: string | undefined): DocumentNumbers {
  if (!locale) {
    return {
      count: (value) => String(value),
      distance: (value) => value.toLocaleString(),
      quantity: (value, unit) => formatQuantity(value, unit),
    }
  }
  const counts = formatter(locale, { useGrouping: false, maximumFractionDigits: 2 })
  const distances = formatter(locale, { maximumFractionDigits: 0 })
  const count = (value: number) => (counts ? printable(counts.format(value)) : String(value))
  return {
    count,
    distance: (value) => (distances ? printable(distances.format(value)) : String(value)),
    quantity: (value, unit) => (unit ? `${count(value)} ${unit}` : count(value)),
  }
}

/** The service type as the document's language names it, or as stored when it has no name. */
export function serviceTypeName(type: string, labels: Record<string, string>): string {
  const key = `serviceType${type.charAt(0).toUpperCase()}${type.slice(1)}`
  return labels[key] || type
}
