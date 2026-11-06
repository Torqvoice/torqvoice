/**
 * Makes as the code service keys them (`ford`, `land-rover`) and as people write them, for
 * the import's make picker and for naming a make's codes. A make the service has that is not
 * listed here still works; its name is made from its key.
 */

export interface Make {
  key: string
  name: string
  /** Outboards and marine engines, offered to a marine workshop. */
  marine?: boolean
}

export const MAKES: Make[] = [
  { key: 'acura', name: 'Acura' },
  { key: 'alfa-romeo', name: 'Alfa Romeo' },
  { key: 'audi', name: 'Audi' },
  { key: 'bmw', name: 'BMW' },
  { key: 'byd', name: 'BYD' },
  { key: 'cadillac', name: 'Cadillac' },
  { key: 'chevrolet', name: 'Chevrolet' },
  { key: 'chrysler', name: 'Chrysler' },
  { key: 'citroen', name: 'Citroën' },
  { key: 'cupra', name: 'Cupra' },
  { key: 'dacia', name: 'Dacia' },
  { key: 'dodge', name: 'Dodge' },
  { key: 'ds', name: 'DS' },
  { key: 'fiat', name: 'Fiat' },
  { key: 'ford', name: 'Ford' },
  { key: 'gmc', name: 'GMC' },
  { key: 'honda', name: 'Honda' },
  { key: 'hyundai', name: 'Hyundai' },
  { key: 'infiniti', name: 'Infiniti' },
  { key: 'isuzu', name: 'Isuzu' },
  { key: 'iveco', name: 'Iveco' },
  { key: 'jaguar', name: 'Jaguar' },
  { key: 'jeep', name: 'Jeep' },
  { key: 'kia', name: 'Kia' },
  { key: 'land-rover', name: 'Land Rover' },
  { key: 'lexus', name: 'Lexus' },
  { key: 'man', name: 'MAN' },
  { key: 'mazda', name: 'Mazda' },
  { key: 'mercedes-benz', name: 'Mercedes-Benz' },
  { key: 'mg', name: 'MG' },
  { key: 'mitsubishi', name: 'Mitsubishi' },
  { key: 'nissan', name: 'Nissan' },
  { key: 'opel', name: 'Opel / Vauxhall' },
  { key: 'peugeot', name: 'Peugeot' },
  { key: 'polestar', name: 'Polestar' },
  { key: 'porsche', name: 'Porsche' },
  { key: 'ram', name: 'Ram' },
  { key: 'renault', name: 'Renault' },
  { key: 'scania', name: 'Scania' },
  { key: 'seat', name: 'SEAT' },
  { key: 'skoda', name: 'Škoda' },
  { key: 'smart', name: 'smart' },
  { key: 'subaru', name: 'Subaru' },
  { key: 'suzuki', name: 'Suzuki' },
  { key: 'tesla', name: 'Tesla' },
  { key: 'toyota', name: 'Toyota' },
  { key: 'volkswagen', name: 'Volkswagen' },
  { key: 'volvo', name: 'Volvo' },
  { key: 'evinrude', name: 'Evinrude', marine: true },
  { key: 'honda-marine', name: 'Honda Marine', marine: true },
  { key: 'mercruiser', name: 'MerCruiser', marine: true },
  { key: 'mercury', name: 'Mercury', marine: true },
  { key: 'suzuki-marine', name: 'Suzuki Marine', marine: true },
  { key: 'tohatsu', name: 'Tohatsu', marine: true },
  { key: 'volvo-penta', name: 'Volvo Penta', marine: true },
  { key: 'yamaha', name: 'Yamaha', marine: true },
  { key: 'yanmar', name: 'Yanmar', marine: true },
]

const BY_KEY = new Map(MAKES.map((m) => [m.key, m]))

/** A make as the service keys it: lower case letters and digits, words joined by dashes. */
export const MAKE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export function isMakeKey(value: string | null | undefined): value is string {
  return !!value && value.length <= 30 && MAKE_KEY_PATTERN.test(value)
}

/** "Land Rover" as `land-rover`, "Škoda" as `skoda`; null when nothing is left of it. */
export function makeKey(name: string): string | null {
  const key = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[0-9-]+/, '')
    .slice(0, 30)
    .replace(/-+$/, '')
  return isMakeKey(key) ? key : null
}

/** How people write a make: "BMW", "Land Rover"; a key not listed as its words. */
export function makeName(key: string): string {
  const known = BY_KEY.get(key)
  if (known) return known.name
  return key
    .split('-')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}
