import {
  type ConnectorContext,
  ConnectorHttpError,
  type ConnectorServer,
  type SafetyRating,
  type VehicleLookupQuery,
  type VehicleLookupResult,
  type VehicleSafetyQuery,
  type VehicleSafetyReport,
} from '@/features/integrations/Lib/types'
import { safetyJobs } from '@/features/integrations/Lib/vehicle-safety'
import { SAFETY_REPORT_VERSION } from '@/features/integrations/Lib/vehicle-safety-contract'
import { manifest } from './manifest'
import {
  API_URL,
  type NhtsaComplaint,
  type NhtsaRatingDetail,
  type NhtsaRatingVariant,
  type NhtsaRecall,
  VPIC_URL,
  type VpicRow,
  decodeToLookup,
  mapRating,
  mapRecall,
  matchModel,
  pickVariant,
  siteUrl,
  summarizeComplaints,
} from './mapping'

/**
 * Three NHTSA services, all public, all JSON, none needing a key:
 *
 * - vPIC decodes a VIN into make, model, year, engine and body.
 * - api.nhtsa.gov lists recalls and owner complaints by make, model and
 *   model year, and NCAP ratings per rated variant.
 * - api.nhtsa.gov also publishes the model names it files under, which is
 *   how "Civic" typed in a form finds "CIVIC" in the recall database.
 *
 * The services answer 200 with an empty list for a model they do not know,
 * so "not found" is decided from the model list, not from an error.
 */

const VPIC_ERROR_TEXT = 'NHTSA could not decode that VIN'

async function get<T>(ctx: ConnectorContext, url: string): Promise<T> {
  try {
    return await ctx.http.json<T>(url, { headers: { Accept: 'application/json' } })
  } catch (err) {
    if (err instanceof ConnectorHttpError) throw new Error(`NHTSA answered ${err.status}`)
    throw err
  }
}

async function decodeVin(ctx: ConnectorContext, vin: string): Promise<VpicRow | null> {
  const res = await get<{ Results?: VpicRow[] }>(
    ctx,
    `${VPIC_URL}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`
  )
  return res.Results?.[0] ?? null
}

async function lookupVehicle(
  ctx: ConnectorContext,
  query: VehicleLookupQuery
): Promise<VehicleLookupResult | null> {
  const vin = query.vin?.trim().toUpperCase()
  if (!vin) throw new Error('NHTSA looks up by VIN, not by plate; type the VIN and try again')
  if (vin.length !== 17) throw new Error('A VIN has 17 characters')
  const row = await decodeVin(ctx, vin)
  if (!row) throw new Error(VPIC_ERROR_TEXT)
  return decodeToLookup(row, vin)
}

async function models(ctx: ConnectorContext, make: string, year: number): Promise<string[]> {
  const url = new URL(`${API_URL}/products/vehicle/models`)
  url.searchParams.set('modelYear', String(year))
  url.searchParams.set('make', make)
  url.searchParams.set('issueType', 'c')
  const res = await get<{ results?: { model?: string }[] }>(ctx, url.toString())
  const names = new Set<string>()
  for (const r of res.results ?? []) if (r.model) names.add(r.model)
  return [...names]
}

async function recalls(ctx: ConnectorContext, make: string, model: string, year: number) {
  const url = new URL(`${API_URL}/recalls/recallsByVehicle`)
  url.searchParams.set('make', make)
  url.searchParams.set('model', model)
  url.searchParams.set('modelYear', String(year))
  const res = await get<{ results?: NhtsaRecall[] }>(ctx, url.toString())
  return res.results ?? []
}

async function complaints(ctx: ConnectorContext, make: string, model: string, year: number) {
  const url = new URL(`${API_URL}/complaints/complaintsByVehicle`)
  url.searchParams.set('make', make)
  url.searchParams.set('model', model)
  url.searchParams.set('modelYear', String(year))
  const res = await get<{ results?: NhtsaComplaint[] }>(ctx, url.toString())
  return res.results ?? []
}

async function rating(
  ctx: ConnectorContext,
  make: string,
  model: string,
  year: number,
  hints: { doors?: string; bodyClass?: string }
): Promise<SafetyRating | null> {
  const list = await get<{ Results?: NhtsaRatingVariant[] }>(
    ctx,
    `${API_URL}/SafetyRatings/modelyear/${year}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}`
  )
  const variant = pickVariant(list.Results ?? [], hints)
  if (!variant?.VehicleId) return null
  const detail = await get<{ Results?: NhtsaRatingDetail[] }>(
    ctx,
    `${API_URL}/SafetyRatings/VehicleId/${variant.VehicleId}`
  )
  const row = detail.Results?.[0]
  return row ? mapRating(row) : null
}

/**
 * The report for one model year. The VIN, when there is one, settles the
 * make and model in NHTSA's own words and tells the ratings which variant
 * this car is; without it the workshop's spelling is matched against the
 * models NHTSA lists for that make and year.
 */
async function vehicleSafety(
  ctx: ConnectorContext,
  query: VehicleSafetyQuery
): Promise<VehicleSafetyReport> {
  let make = query.make.trim()
  let model = query.model.trim()
  const year = query.year
  const hints: { doors?: string; bodyClass?: string } = {}

  const vin = query.vin?.trim().toUpperCase()
  if (vin && vin.length === 17) {
    try {
      const row = await decodeVin(ctx, vin)
      if (row?.Make && row.Model) {
        make = row.Make
        model = row.Model
        hints.doors = row.Doors
        hints.bodyClass = row.BodyClass
      }
    } catch {
      // The decoder being down is no reason to skip the recalls.
    }
  }

  const known = await models(ctx, make, year)
  const matched = matchModel(model, known)
  if (!matched) {
    return {
      source: manifest.id,
      version: SAFETY_REPORT_VERSION,
      matched: null,
      recalls: [],
      complaints: {
        total: 0,
        crashes: 0,
        fires: 0,
        injuries: 0,
        deaths: 0,
        byComponent: [],
        latest: [],
      },
      rating: null,
      url: siteUrl(make, model, year),
    }
  }

  const [recallRows, complaintRows, stars] = await Promise.all([
    recalls(ctx, make, matched, year),
    complaints(ctx, make, matched, year),
    rating(ctx, make, matched, year, hints).catch(() => null),
  ])
  const seen = new Set<string>()
  const recallList = recallRows
    .map(mapRecall)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter((r) => (seen.has(r.campaign) ? false : (seen.add(r.campaign), true)))
    .sort((a, b) => (b.reported ?? '').localeCompare(a.reported ?? ''))

  return {
    source: manifest.id,
    version: SAFETY_REPORT_VERSION,
    matched: { make: make.toUpperCase(), model: matched, year },
    recalls: recallList,
    complaints: summarizeComplaints(complaintRows),
    rating: stars,
    url: siteUrl(make, matched, year),
  }
}

export const connector: ConnectorServer = {
  manifest,
  async test(ctx) {
    // A decode of a VIN NHTSA itself uses in its examples: proves the
    // service is up without touching anything a workshop owns.
    const row = await decodeVin(ctx, '1HGCM82633A004352')
    return row?.Make ? { ok: true } : { ok: false, message: VPIC_ERROR_TEXT }
  },
  lookupVehicle,
  vehicleSafety,
  jobs: safetyJobs(),
}
