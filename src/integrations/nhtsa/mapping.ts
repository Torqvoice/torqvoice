/**
 * NHTSA's answers in the app's vocabulary.
 *
 * Pure functions over the JSON the three services return, so the shapes can
 * be tested against recorded answers. The decoder writes empty strings for
 * what it does not know; the recall and complaint services write dates as
 * MM/DD/YYYY and file components as upper-case paths.
 */

import { makeCase } from '@/features/integrations/Lib/make-case'
import type {
  SafetyComplaintGroup,
  SafetyRating,
  SafetyRecall,
  VehicleLookupResult,
} from '@/features/integrations/Lib/types'

export const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles'
export const API_URL = 'https://api.nhtsa.gov'
export const SITE_URL = 'https://www.nhtsa.gov'

/** Decoded VIN, one flat row of strings; only the fields the app reads. */
export interface VpicRow {
  ErrorCode?: string
  ErrorText?: string
  Make?: string
  Model?: string
  ModelYear?: string
  Trim?: string
  BodyClass?: string
  Doors?: string
  FuelTypePrimary?: string
  FuelTypeSecondary?: string
  ElectrificationLevel?: string
  TransmissionStyle?: string
  DisplacementL?: string
  EngineModel?: string
  EngineCylinders?: string
  VehicleType?: string
  PlantCountry?: string
}

export interface NhtsaRecall {
  NHTSACampaignNumber?: string
  Manufacturer?: string
  Component?: string
  Summary?: string
  Consequence?: string
  Remedy?: string
  Notes?: string
  ReportReceivedDate?: string
  parkIt?: boolean
  parkOutSide?: boolean
  Make?: string
  Model?: string
  ModelYear?: string
}

export interface NhtsaComplaint {
  odiNumber?: number
  components?: string
  summary?: string
  crash?: boolean
  fire?: boolean
  numberOfInjuries?: number
  numberOfDeaths?: number
  dateOfIncident?: string
  dateComplaintFiled?: string
}

export interface NhtsaRatingVariant {
  VehicleDescription?: string
  VehicleId?: number
}

export interface NhtsaRatingDetail {
  OverallRating?: string
  OverallFrontCrashRating?: string
  FrontCrashDriversideRating?: string
  FrontCrashPassengersideRating?: string
  OverallSideCrashRating?: string
  SideCrashDriversideRating?: string
  SideCrashPassengersideRating?: string
  RolloverRating?: string
  /** The rating under the newer rollover test, filled when RolloverRating is not. */
  RolloverRating2?: string
  VehicleDescription?: string
  VehiclePicture?: string
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t && t !== 'Not Applicable' ? t : undefined
}

/**
 * Decoder error codes that mean the VIN itself is bad, as opposed to codes
 * that only say a few positions are unknown. 0 is clean; 1 a wrong check
 * digit, which is still decoded; 400 invalid characters; and 6, 7, 8 and
 * 11 are VINs the decoder cannot place at all.
 */
const FATAL_DECODE_CODES = new Set(['6', '7', '8', '11', '400'])

export function decodeFailed(row: VpicRow): boolean {
  const codes = (row.ErrorCode ?? '0').split(',').map((c) => c.trim())
  if (codes.some((c) => FATAL_DECODE_CODES.has(c))) return true
  return !text(row.Make)
}

/** The form's fuel word from the decoder's primary and secondary fuels. */
export function fuelType(row: VpicRow): string | undefined {
  const primary = text(row.FuelTypePrimary)?.toLowerCase()
  const secondary = text(row.FuelTypeSecondary)?.toLowerCase()
  const level = text(row.ElectrificationLevel)?.toLowerCase() ?? ''
  if (!primary) return undefined
  const electric = (s: string | undefined) => Boolean(s && /electric/.test(s))
  if (electric(primary) && !secondary)
    return level.includes('bev') || !level ? 'electric' : 'hybrid'
  if (electric(secondary) || /hev|hybrid|phev/.test(level)) return 'hybrid'
  if (/diesel/.test(primary)) return 'diesel'
  if (/gasoline|ethanol|flexible|e85|cng|lpg|propane|natural gas/.test(primary)) {
    return /cng|lpg|propane|natural gas/.test(primary) ? 'other' : 'gasoline'
  }
  if (/hydrogen|fuel cell/.test(primary)) return 'other'
  return 'other'
}

export function transmission(row: VpicRow): string | undefined {
  const style = text(row.TransmissionStyle)?.toLowerCase()
  if (!style) return undefined
  if (/cvt|continuously/.test(style)) return 'cvt'
  if (/manual/.test(style)) return 'manual'
  if (/automatic|automated|dual clutch|dct|amt/.test(style)) return 'automatic'
  return undefined
}

/** Litres to one decimal, as the form shows engine size: "3.0". */
export function engineSize(row: VpicRow): string | undefined {
  const litres = Number(text(row.DisplacementL))
  if (!Number.isFinite(litres) || litres <= 0) return undefined
  return (Math.round(litres * 10) / 10).toFixed(1)
}

export function decodeToLookup(row: VpicRow, vin: string): VehicleLookupResult | null {
  if (decodeFailed(row)) return null
  const year = Number(text(row.ModelYear))
  const model = [text(row.Model), text(row.Trim)].filter(Boolean).join(' ')
  return {
    make: text(row.Make) ? makeCase(text(row.Make) as string) : undefined,
    model: model || undefined,
    year: Number.isFinite(year) && year > 1900 ? year : undefined,
    vin: vin.toUpperCase(),
    fuelType: fuelType(row),
    transmission: transmission(row),
    engineSize: engineSize(row),
    engineCode: text(row.EngineModel),
    vehicleClass: text(row.BodyClass) ?? text(row.VehicleType),
  }
}

/** MM/DD/YYYY as NHTSA writes it, to ISO. */
export function isoDate(value: string | undefined): string | null {
  const m = value ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value.trim()) : null
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/**
 * "AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE" as a person would say it:
 * "Air bags, frontal, driver side, inflator module". Initials and the
 * authority's slash pairs are kept as written.
 */
export function humanizeComponent(value: string): string {
  const sentence = value
    .split(':')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .join(', ')
  return sentence
    .replace(/^[a-z]/, (c) => c.toUpperCase())
    .replace(/\b(abs|esc|ecu|led|hid|srs|tpms|ac|cv|lpg|cng|awd|4wd|fwd|rwd)\b/g, (s) =>
      s.toUpperCase()
    )
}

export function mapRecall(r: NhtsaRecall): SafetyRecall | null {
  const campaign = text(r.NHTSACampaignNumber)
  if (!campaign) return null
  return {
    campaign,
    component: text(r.Component) ?? 'UNKNOWN',
    summary: text(r.Summary) ?? '',
    consequence: text(r.Consequence) ?? '',
    remedy: text(r.Remedy) ?? '',
    reported: isoDate(r.ReportReceivedDate),
    parkIt: r.parkIt === true,
    parkOutside: r.parkOutSide === true,
    manufacturer: text(r.Manufacturer) ?? '',
  }
}

/**
 * A complaint names one or more components. One component may itself carry a
 * comma and a space ("SERVICE BRAKES, HYDRAULIC"); several are joined with a
 * bare comma ("AIR BAGS,SEAT BELTS"). Split only on the bare one.
 */
export function complaintComponents(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/,(?=\S)/)
    .map((c) => c.trim())
    .filter(Boolean)
}

export interface ComplaintSummary {
  total: number
  crashes: number
  fires: number
  injuries: number
  deaths: number
  byComponent: SafetyComplaintGroup[]
  latest: { date: string | null; component: string; summary: string }[]
}

export function summarizeComplaints(rows: NhtsaComplaint[], top = 8, latest = 5): ComplaintSummary {
  const counts = new Map<string, number>()
  let crashes = 0
  let fires = 0
  let injuries = 0
  let deaths = 0
  for (const c of rows) {
    if (c.crash) crashes++
    if (c.fire) fires++
    injuries += Number(c.numberOfInjuries) || 0
    deaths += Number(c.numberOfDeaths) || 0
    for (const component of complaintComponents(c.components)) {
      counts.set(component, (counts.get(component) ?? 0) + 1)
    }
  }
  const total = rows.length
  const byComponent = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([component, count]) => ({
      component,
      count,
      share: total > 0 ? Math.round((count / total) * 1000) / 1000 : 0,
    }))
  const newest = [...rows]
    .map((c) => ({
      date: isoDate(c.dateComplaintFiled) ?? isoDate(c.dateOfIncident),
      component: complaintComponents(c.components).join(', ') || 'UNKNOWN',
      summary: (text(c.summary) ?? '').slice(0, 400),
    }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, latest)
  return { total, crashes, fires, injuries, deaths, byComponent, latest: newest }
}

function stars(value: string | undefined): number | null {
  const n = Number(text(value))
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null
}

/** The overall figure when NHTSA gives one, otherwise the lower of the two seats. */
function combined(
  overall: string | undefined,
  driver: string | undefined,
  passenger: string | undefined
) {
  const o = stars(overall)
  if (o !== null) return o
  const sides = [stars(driver), stars(passenger)].filter((n): n is number => n !== null)
  return sides.length ? Math.min(...sides) : null
}

export function mapRating(detail: NhtsaRatingDetail): SafetyRating | null {
  const rating: SafetyRating = {
    overall: stars(detail.OverallRating),
    frontal: combined(
      detail.OverallFrontCrashRating,
      detail.FrontCrashDriversideRating,
      detail.FrontCrashPassengersideRating
    ),
    side: combined(
      detail.OverallSideCrashRating,
      detail.SideCrashDriversideRating,
      detail.SideCrashPassengersideRating
    ),
    rollover: stars(detail.RolloverRating) ?? stars(detail.RolloverRating2),
    description: text(detail.VehicleDescription) ?? '',
  }
  if (
    rating.overall === null &&
    rating.frontal === null &&
    rating.side === null &&
    rating.rollover === null
  )
    return null
  return rating
}

/**
 * Which rated variant is this car: a coupe wants the 2-door row, a wagon
 * the wagon row. Falls back to the first variant when nothing distinguishes.
 */
export function pickVariant(
  variants: NhtsaRatingVariant[],
  hints: { doors?: string; bodyClass?: string }
): NhtsaRatingVariant | null {
  if (variants.length === 0) return null
  const doors = Number(hints.doors)
  const body = (hints.bodyClass ?? '').toLowerCase()
  const score = (v: NhtsaRatingVariant) => {
    const d = (v.VehicleDescription ?? '').toLowerCase()
    let s = 0
    if (doors === 2 && /2-dr|2 dr|coupe/.test(d)) s += 2
    if (doors >= 4 && /4-dr|4 dr|sedan/.test(d)) s += 2
    if (body.includes('wagon') && /wagon/.test(d)) s += 2
    if (body.includes('convertible') && /conv/.test(d)) s += 2
    if (/w\/sab|side air/.test(d)) s += 1
    return s
  }
  return [...variants].sort((a, b) => score(b) - score(a))[0]
}

/**
 * The model name NHTSA files the recalls under, from the list it publishes
 * for the make and year. Exact first, then the workshop's word as a prefix
 * or contained ("Civic" for "CIVIC GX", "3 Series" for "328I" fails and is
 * left for the person). Null means no near match.
 */
export function matchModel(wanted: string, available: string[]): string | null {
  const norm = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
  const target = norm(wanted)
  if (!target) return null
  const list = available.map((m) => ({ raw: m, norm: norm(m) }))
  const exact = list.find((m) => m.norm === target)
  if (exact) return exact.raw
  const first = target.split(' ')[0]
  const prefixed = list.filter((m) => m.norm.startsWith(target) || target.startsWith(m.norm))
  if (prefixed.length > 0) {
    prefixed.sort(
      (a, b) => Math.abs(a.norm.length - target.length) - Math.abs(b.norm.length - target.length)
    )
    return prefixed[0].raw
  }
  const byFirstWord = list.filter((m) => m.norm.split(' ')[0] === first && first.length >= 3)
  if (byFirstWord.length === 1) return byFirstWord[0].raw
  return null
}

export function siteUrl(make: string, model: string, year: number): string {
  return `${SITE_URL}/vehicle/${year}/${encodeURIComponent(make.toUpperCase())}/${encodeURIComponent(model.toUpperCase())}`
}
