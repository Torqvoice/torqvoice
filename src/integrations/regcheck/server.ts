import type {
  ConnectorContext,
  ConnectorServer,
  VehicleLookupQuery,
  VehicleLookupResult,
} from '@/features/integrations/Lib/types'
import { makeCase } from '@/features/integrations/Lib/make-case'
import { AUSTRALIAN_STATES, manifest } from './manifest'

/**
 * RegCheck is an ASP.NET web service with one operation per country,
 * reachable with a plain GET: /api/reg.asmx/CheckIreland?RegistrationNumber=
 * ...&username=... The XML that comes back carries a vehicleJson element
 * with the vehicle as JSON, which is what the mapper reads. The JSON's shape
 * is shared across countries but each fills a different subset, and several
 * fields arrive either as a string or as an object with a CurrentTextValue.
 *
 * Errors come back as HTTP 500 with a plain-text reason ("Your username is
 * incorrect"). The vendor does not document how a plate that is not on file
 * is reported, so both an empty answer and a reason that reads like "not
 * found" are treated as no vehicle.
 *
 * A plate is personal data in most of these countries, so nothing here
 * writes one into the connection log; the log records outcomes only.
 */
const BASE_URL = 'https://www.regcheck.org.uk/api/reg.asmx'
const CREDITS_URL = 'https://www.regcheck.org.uk/ajax/getcredits.aspx'

export type Country =
  | 'AU'
  | 'NZ'
  | 'US'
  | 'IE'
  | 'SE'
  | 'DK'
  | 'FI'
  | 'EE'
  | 'CZ'
  | 'SK'
  | 'HU'
  | 'HR'
  | 'NO'

const OPERATIONS: Record<Country, string> = {
  AU: 'CheckAustralia',
  NZ: 'CheckNewZealand',
  US: 'CheckUSA',
  IE: 'CheckIreland',
  SE: 'CheckSweden',
  DK: 'CheckDenmark',
  FI: 'CheckFinland',
  EE: 'CheckEstonia',
  CZ: 'CheckCzechRepublic',
  SK: 'CheckSlovakia',
  HU: 'CheckHungary',
  HR: 'CheckCroatia',
  NO: 'CheckNorway',
}

/** A field the vendor sends either bare or wrapped, depending on the country. */
export type Wrapped = string | number | null | { CurrentTextValue?: string | number | null }

/**
 * The union of what the vendor's documented samples and a live answer carry
 * for the countries offered. Australia's states differ among themselves as
 * much as countries do: NSW, TAS and WA describe the engine in words and put
 * the real fields under "extended", VIC and QLD send the VIN and little
 * else, NT nests the registration in RegistrationPlate. The VIN field is
 * spelt "Vechile..." in the documentation and "Vehicle..." on the wire.
 */
export interface RegCheckVehicle {
  Description?: string
  RegistrationYear?: string | number
  CarMake?: Wrapped
  CarModel?: Wrapped
  MakeDescription?: Wrapped
  ModelDescription?: Wrapped
  EngineSize?: Wrapped
  FuelType?: Wrapped
  Transmission?: Wrapped
  BodyStyle?: Wrapped
  Colour?: string
  VehicleIdentificationNumber?: string
  VechileIdentificationNumber?: string
  VIN?: string
  EngineCode?: string
  /**
   * Ireland and Victoria: an engine number. New South Wales and Western
   * Australia: a description ("1.6 litre, 4 cyl, WQ"). Tasmania: cubic
   * centimetres ("1968").
   */
  Engine?: string
  /** Tasmania's fuel, bare. */
  Fuel?: string
  RegistrationDate?: string
  /** Czech Republic's registration date. */
  Date?: string
  NetWeight?: string | number
  GrossWeight?: string | number
  VehicleType?: string
  State?: string
  /**
   * Australia, NSW and WA. Western Australia still sends the flat
   * capacityValue and capacityUnit the documentation shows; New South Wales
   * now nests them under engine.capacity. Tasmania sends null.
   */
  extended?: {
    capacityValue?: string
    capacityUnit?: string
    engine?: { capacity?: { value?: string; unit?: string } }
    transmissionType?: string
    fuelType?: string
    bodyType?: string
  } | null
  /** Australia, NT: registration and inspection as epoch milliseconds. */
  RegistrationPlate?: { date_inspection?: number; status?: string }
  /**
   * Denmark: the Motorregister record behind the summary. Norway: the
   * vehicle register's own fields, zero-padded numbers and YYYYMMDD dates,
   * with 00000000 for a date that is not set.
   */
  ExtendedInformation?: {
    KoeretoejOplysningGrundStruktur?: {
      KoeretoejOplysningFoersteRegistreringDato?: string
      KoeretoejOplysningTotalVaegt?: string
      KoeretoejOplysningEgenVaegt?: string
    }
    SynResultatStruktur?: { SynResultatSynsDato?: string; SynResultatSynsResultat?: string }
    unr?: string
    'f-g-n'?: string
    farge?: string
    girkasse?: string
    drivst?: string
    egenvekt?: string
    totvekt?: string
    'siste-pkk'?: string
    'neste-pkk'?: string
    'dekk-f'?: string
    'dekk-b'?: string
    'felg-f'?: string
    'felg-b'?: string
    'mili-f'?: string
    'mili-b'?: string
    'hast-f'?: string
    'hast-b'?: string
  }
}

/** Norway's drivst codes, the same code list Statens vegvesen publishes. */
const NORWEGIAN_FUEL: Record<string, string> = {
  '01': 'gasoline',
  '02': 'diesel',
  '05': 'electric',
}

export function text(value: Wrapped | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object') return text(value.CurrentTextValue)
  const s = String(value).trim()
  return s ? s : undefined
}

/**
 * One fuel for the form's select, from the words the samples use: Petrol,
 * Diesel (UK, Ireland, New Zealand, Finland), Bensin (Sweden), Benzin
 * (Denmark, Hungary), and the Czech single letter D. Two named together are a
 * hybrid; a word the list does not know leaves the field alone.
 */
export function fuelType(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value.toLowerCase()
  const hybrid = /hybrid|hybride|hibrid/.test(v)
  const electric = /electri|elektri|sähkö|^el$/.test(v)
  const diesel = /diesel|dísel|gasoil|nafta/.test(v) || v === 'd'
  const gasoline = /petrol|gasoline|bensin|benzin|benzín|bensiini|gasolina/.test(v)
  if (hybrid || (electric && (diesel || gasoline))) return 'hybrid'
  if (electric) return 'electric'
  if (diesel) return 'diesel'
  if (gasoline) return 'gasoline'
  return undefined
}

/** Gearbox words from the samples: Automatic, Automaattinen, Manuell, MANUAL, "4-Speed Auto". */
export function transmission(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value.toLowerCase()
  if (/cvt|variat|continu/.test(v)) return 'cvt'
  if (/auto/.test(v)) return 'automatic'
  if (/manu/.test(v)) return 'manual'
  return undefined
}

/**
 * Displacement as the form shows it, from the forms the samples take:
 * "2143", "1798 cm", "3405.0", 1984 (cubic centimetres), "2.0" with unit "L"
 * from Australia's extended data, or "5.7L V8 MPI" from the United States.
 */
export function engineSize(value: string | undefined, unit?: string): string | undefined {
  if (!value) return undefined
  const m = /(\d+(?:[.,]\d+)?)\s*(l\b|litre|liter)?/i.exec(value)
  if (!m) return undefined
  const n = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return undefined
  const litres = Boolean(m[2]) || unit?.toUpperCase() === 'L' || n < 30
  return `${(litres ? n : n / 1000).toFixed(1)} L`
}

/**
 * ISO date from the forms seen on the wire: 21/09/2010 (Finland, Czech
 * Republic), 2006.11.23 (Hungary), 1993-05-03+02:00 (Denmark). Sweden's bare
 * "2006" is a year, not a date.
 */
export function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value.trim()
  let m = /^(\d{4})[-.](\d{1,2})[-.](\d{1,2})/.exec(v)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  // Norway's YYYYMMDD, where 00000000 means not set.
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (m && m[1] !== '0000') return `${m[1]}-${m[2]}-${m[3]}`
  return undefined
}

/**
 * Australia's Engine field, when it is a capacity: "1.6 litre, 4 cyl, WQ" or
 * "1968". Victoria and Ireland put an engine number there, which is neither.
 */
function engineFieldSize(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (/litre|liter|\bl\b/i.test(value) || /^\d{3,5}$/.test(value.trim())) return engineSize(value)
  return undefined
}

function vin(record: RegCheckVehicle): string | undefined {
  for (const candidate of [
    record.VIN,
    record.VehicleIdentificationNumber,
    record.VechileIdentificationNumber,
    record.ExtendedInformation?.unr,
  ]) {
    const v = text(candidate)?.toUpperCase()
    // NSW, TAS and WA put a NEVDIS code here ("FORFMT---7402E01994A"), not a VIN.
    if (v && /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v)) return v
  }
  return undefined
}

function kilograms(value: string | number | undefined): number | undefined {
  const s = text(value)
  // The Czech sample gives a range ("1 385 - 1 575"), which is not one weight.
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return undefined
  const n = Number(s)
  return n > 0 ? n : undefined
}

/** Norway's tyre and rim sizes, front then rear, with the load index and speed rating. */
function norwegianTyres(ext: NonNullable<RegCheckVehicle['ExtendedInformation']>) {
  const axles = [
    {
      axle: 1,
      tyre: text(ext['dekk-f']),
      rim: text(ext['felg-f']),
      loadIndex: text(ext['mili-f']),
      speedRating: text(ext['hast-f']),
    },
    {
      axle: 2,
      tyre: text(ext['dekk-b']),
      rim: text(ext['felg-b']),
      loadIndex: text(ext['mili-b']),
      speedRating: text(ext['hast-b']),
    },
  ]
  const present = axles.filter((a) => a.tyre || a.rim)
  return present.length > 0 ? present : undefined
}

/** The vendor's JSON in the app's vocabulary. Exported for the contract test. */
export function mapVehicle(record: RegCheckVehicle, plate?: string): VehicleLookupResult {
  const make = text(record.CarMake) ?? text(record.MakeDescription)
  const model = text(record.CarModel) ?? text(record.ModelDescription)
  const ext = record.ExtendedInformation
  const dmr = ext?.KoeretoejOplysningGrundStruktur
  const syn = ext?.SynResultatStruktur
  const capacity = record.extended?.engine?.capacity
  const firstRegistered =
    isoDate(text(record.RegistrationDate)) ??
    isoDate(text(record.Date)) ??
    isoDate(text(dmr?.KoeretoejOplysningFoersteRegistreringDato)) ??
    isoDate(text(ext?.['f-g-n']))
  const yearText = text(record.RegistrationYear) ?? firstRegistered?.slice(0, 4)
  const year = Number(yearText)
  const colour = text(record.Colour) ?? text(ext?.farge)
  const kerb =
    kilograms(record.NetWeight) ??
    kilograms(dmr?.KoeretoejOplysningEgenVaegt) ??
    kilograms(ext?.egenvekt)
  const grossMax =
    kilograms(record.GrossWeight) ??
    kilograms(dmr?.KoeretoejOplysningTotalVaegt) ??
    kilograms(ext?.totvekt)
  const drivst = text(ext?.drivst)
  const inspection = record.RegistrationPlate?.date_inspection

  const result: VehicleLookupResult = {
    make: make ? makeCase(make) : undefined,
    // The ACT sample repeats the make as the model; that is not a model.
    model: model && model !== make ? model : undefined,
    year: Number.isFinite(year) && year > 1800 ? year : undefined,
    vin: vin(record),
    licensePlate: plate,
    color: colour ? makeCase(colour) : undefined,
    fuelType:
      fuelType(text(record.FuelType) ?? text(record.Fuel) ?? text(record.extended?.fuelType)) ??
      (drivst ? NORWEGIAN_FUEL[drivst] : undefined),
    transmission: transmission(
      text(record.Transmission) ?? text(record.extended?.transmissionType) ?? text(ext?.girkasse)
    ),
    engineSize:
      engineSize(text(capacity?.value), capacity?.unit) ??
      engineSize(text(record.extended?.capacityValue), record.extended?.capacityUnit) ??
      engineSize(text(record.EngineSize)) ??
      engineFieldSize(text(record.Engine)),
    engineCode: text(record.EngineCode),
    vehicleClass: text(record.BodyStyle) ?? text(record.VehicleType),
    firstRegistered,
    inspectionDue:
      typeof inspection === 'number' && inspection > 0
        ? new Date(inspection).toISOString().slice(0, 10)
        : isoDate(text(ext?.['neste-pkk'])),
    lastInspected:
      syn?.SynResultatSynsResultat === 'Godkendt'
        ? isoDate(text(syn.SynResultatSynsDato))
        : isoDate(text(ext?.['siste-pkk'])),
    tyres: ext ? norwegianTyres(ext) : undefined,
    weights: kerb || grossMax ? { kerb, grossMax } : undefined,
  }
  // Drop the keys that came back empty so a form's fill-if-empty sees only values.
  for (const key of Object.keys(result) as (keyof VehicleLookupResult)[]) {
    if (result[key] === undefined) delete result[key]
  }
  return result
}

/** Plates as printed, with the spaces and hyphens people type; the vendor's samples carry none. */
export function normalisePlate(plate: string): string {
  return plate.replace(/[\s-]+/g, '').toUpperCase()
}

/** The JSON out of the vendor's XML envelope, or null when the element is empty or missing. */
export function vehicleJsonOf(xml: string): RegCheckVehicle | null {
  const m = /<vehicleJson>([\s\S]*?)<\/vehicleJson>/.exec(xml)
  if (!m) return null
  const decoded = m[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .trim()
  if (!decoded) return null
  const parsed = JSON.parse(decoded) as RegCheckVehicle
  return parsed && typeof parsed === 'object' ? parsed : null
}

function username(ctx: ConnectorContext): string {
  return typeof ctx.credentials.username === 'string' ? ctx.credentials.username.trim() : ''
}

export function countryOf(ctx: ConnectorContext): Country | null {
  const value = ctx.connection.settings.country
  return typeof value === 'string' && value in OPERATIONS ? (value as Country) : null
}

/** The state a lookup is made in, for the two countries that register per state; '' elsewhere, null when missing. */
function stateOf(ctx: ConnectorContext, country: Country): string | null {
  if (country === 'AU') {
    const s = ctx.connection.settings.auState
    return typeof s === 'string' && (AUSTRALIAN_STATES as readonly string[]).includes(s) ? s : null
  }
  if (country === 'US') {
    const s = ctx.connection.settings.usState
    return typeof s === 'string' && /^[A-Za-z]{2}$/.test(s.trim()) ? s.trim().toUpperCase() : null
  }
  return ''
}

function lookupUrl(country: Country, plate: string, state: string, user: string): string {
  const url = new URL(`${BASE_URL}/${OPERATIONS[country]}`)
  url.searchParams.set('RegistrationNumber', plate)
  if (state) url.searchParams.set('State', state)
  url.searchParams.set('username', user)
  return url.toString()
}

/** "UK Lookup failed" is what a plate not on file gets, seen live; the rest are phrases from the vendor's site. */
const NOT_FOUND =
  /lookup failed|not found|no (vehicle|data|record|result)|unable to find|could not find|no match/i

async function lookupVehicle(
  ctx: ConnectorContext,
  query: VehicleLookupQuery
): Promise<VehicleLookupResult | null> {
  const plate = query.plate?.trim() ? normalisePlate(query.plate) : ''
  if (!plate) {
    await ctx.log('info', 'Vehicle lookup: a plate is needed, this registry has no VIN search')
    return null
  }
  const country = countryOf(ctx)
  if (!country) throw new Error('RegCheck: choose a country on the integration page')
  const state = stateOf(ctx, country)
  if (state === null) throw new Error('RegCheck: choose the state on the integration page')
  const user = username(ctx)
  if (!user) throw new Error('RegCheck: a username is required')

  const res = await ctx.http.fetch(lookupUrl(country, plate, state, user), {
    headers: { Accept: 'application/xml' },
  })
  const body = await res.text()
  if (!res.ok) {
    const reason = body
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
    if (/username is incorrect/i.test(reason)) {
      await ctx.log('error', 'Vehicle lookup: username rejected', { status: res.status })
      throw new Error('RegCheck rejected the username')
    }
    if (NOT_FOUND.test(reason)) {
      await ctx.log('info', 'Vehicle lookup: no match', { country })
      return null
    }
    await ctx.log('error', 'Vehicle lookup failed', { status: res.status, reason })
    throw new Error(reason ? `RegCheck: ${reason}` : `RegCheck answered HTTP ${res.status}`)
  }
  const record = vehicleJsonOf(body)
  if (!record || (!text(record.CarMake) && !text(record.MakeDescription) && !record.Description)) {
    await ctx.log('info', 'Vehicle lookup: no match', { country })
    return null
  }
  await ctx.log('info', 'Vehicle lookup: match', {
    country,
    state: text(record.State),
    fields: Object.keys(record).filter((k) => k !== 'ImageUrl'),
  })
  return mapVehicle(record, plate)
}

export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const user = username(ctx)
    if (!user) return { ok: false, message: 'RegCheck: a username is required' }
    const country = countryOf(ctx)
    if (!country) return { ok: false, message: 'RegCheck: choose the country to search' }
    if (stateOf(ctx, country) === null) {
      return { ok: false, message: 'RegCheck: choose the state to search' }
    }
    // The credit balance is free to read and needs only the username. The
    // vendor answers 0 both for an unknown username and for an empty account,
    // and either way no lookup would succeed.
    const url = new URL(CREDITS_URL)
    url.searchParams.set('username', user)
    const res = await ctx.http.fetch(url.toString())
    if (!res.ok) return { ok: false, message: `RegCheck answered HTTP ${res.status}` }
    const credits = Number((await res.text()).trim())
    if (!Number.isFinite(credits)) {
      return { ok: false, message: 'RegCheck gave an unexpected answer' }
    }
    if (credits <= 0) {
      return {
        ok: false,
        message: 'RegCheck: this username is unknown or its account has no credits left',
      }
    }
    return { ok: true }
  },

  lookupVehicle,

  jobs: {},
}
