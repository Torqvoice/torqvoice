/**
 * Country codes for the phone field, asked once per workshop.
 *
 * Names are not listed here on purpose. `Intl.DisplayNames` renders a region
 * code in whatever language the page is in, so a Norwegian desk reads "Norge"
 * and a German one reads "Norwegen" without twelve translations of the same
 * forty words, and without any of them going stale.
 *
 * Europe in full plus the markets the product is actually sold into. A
 * workshop somewhere not on this list can still type an international number
 * directly, which is the escape hatch that keeps this list from having to be
 * complete.
 */
export const DIAL_CODES: readonly { region: string; dial: string }[] = [
  { region: 'AT', dial: '+43' },
  { region: 'AU', dial: '+61' },
  { region: 'BE', dial: '+32' },
  { region: 'BG', dial: '+359' },
  { region: 'BR', dial: '+55' },
  { region: 'CA', dial: '+1' },
  { region: 'CH', dial: '+41' },
  { region: 'CY', dial: '+357' },
  { region: 'CZ', dial: '+420' },
  { region: 'DE', dial: '+49' },
  { region: 'DK', dial: '+45' },
  { region: 'EE', dial: '+372' },
  { region: 'ES', dial: '+34' },
  { region: 'FI', dial: '+358' },
  { region: 'FR', dial: '+33' },
  { region: 'GB', dial: '+44' },
  { region: 'GR', dial: '+30' },
  { region: 'HR', dial: '+385' },
  { region: 'HU', dial: '+36' },
  { region: 'IE', dial: '+353' },
  { region: 'IS', dial: '+354' },
  { region: 'IT', dial: '+39' },
  { region: 'LT', dial: '+370' },
  { region: 'LU', dial: '+352' },
  { region: 'LV', dial: '+371' },
  { region: 'MT', dial: '+356' },
  { region: 'NL', dial: '+31' },
  { region: 'NO', dial: '+47' },
  { region: 'NZ', dial: '+64' },
  { region: 'PL', dial: '+48' },
  { region: 'PT', dial: '+351' },
  { region: 'RO', dial: '+40' },
  { region: 'SE', dial: '+46' },
  { region: 'SI', dial: '+386' },
  { region: 'SK', dial: '+421' },
  { region: 'TR', dial: '+90' },
  { region: 'UA', dial: '+380' },
  { region: 'US', dial: '+1' },
  { region: 'ZA', dial: '+27' },
]

/**
 * The list in the reader's own language, alphabetically by that language.
 *
 * Sorted with a collator rather than by code point, so accented names land
 * where somebody scanning the list expects them rather than after Z.
 */
export function countriesFor(locale: string): { region: string; dial: string; name: string }[] {
  let display: Intl.DisplayNames | null = null
  try {
    display = new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    // A runtime without the region data still gets a usable list, just one
    // labelled by code.
  }

  const collator = new Intl.Collator(locale)
  return DIAL_CODES.map((c) => ({
    ...c,
    name: display?.of(c.region) ?? c.region,
  })).sort((a, b) => collator.compare(a.name, b.name))
}
