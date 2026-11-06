import 'server-only'
import {
  codeDetailFor,
  faultCodesConnected,
  fixesFor,
  jobsWithCode,
  oemCodeFor,
  oemMakesFor,
  reportStates,
  researchFor,
  searchOemCodes,
  waveformsFor,
  vehicleForCodes,
} from './service.server'
import { getManifest } from '@/integrations/registry'
import { oemFixCode } from './codes'
import { makeKey, makeName as nameOfMake } from './makes'
import { oemDetail } from './oem'
import type {
  CodeFixes,
  CodeVehicle,
  CodeWaveforms,
  FaultCodePageData,
  ReportState,
  ResearchState,
} from './types'

export type { FaultCodePageData }

/**
 * The code sheet and the code page in one read: the service's meaning and
 * details, the jobs here, the report state and, for the page, the shared
 * fixes. The workshop's own jobs are read even when the service does not
 * answer.
 */
export async function loadFaultCodePage(
  organizationId: string,
  code: string,
  vehicleId: string | null | undefined,
  locale: string,
  options: { fixes?: boolean } = {}
): Promise<FaultCodePageData> {
  const vehicle = await vehicleForCodes(organizationId, vehicleId)
  const connected = await faultCodesConnected(organizationId)
  const [detail, jobs, reports, fixes, oemMakes, research, waveforms, makeCodes] =
    await Promise.all([
      codeDetailFor(organizationId, code, vehicle, locale),
      jobsWithCode(organizationId, code),
      connected ? reportStates(organizationId, [code]) : Promise.resolve({}),
      options.fixes && connected
        ? fixesFor(organizationId, code)
        : Promise.resolve<CodeFixes | null>(null),
      connected ? oemMakesFor(organizationId) : Promise.resolve([]),
      options.fixes && connected
        ? researchFor(organizationId, code)
        : Promise.resolve<ResearchState | null>(null),
      options.fixes && connected
        ? waveformsFor(organizationId, code)
        : Promise.resolve<CodeWaveforms | null>(null),
      connected ? searchOemCodes(organizationId, code, locale) : Promise.resolve([]),
    ])
  // The car's own make first: on a Ford, Ford's P1000 is the one that counts.
  const ownMake = vehicle?.make ? makeKey(vehicle.make) : null
  makeCodes.sort((a, b) => Number(b.make === ownMake) - Number(a.make === ownMake))
  return {
    code,
    makeCodes,
    connected,
    connectable: getManifest('torqvoice-codes') !== null,
    available: detail.available,
    detail: detail.detail,
    jobs,
    fixes,
    report: (reports as Record<string, ReportState>)[code] ?? null,
    vehicle: codeVehicle(vehicle),
    oemMakes,
    research,
    waveforms,
  }
}

function codeVehicle(vehicle: Awaited<ReturnType<typeof vehicleForCodes>>): CodeVehicle | null {
  return vehicle
    ? {
        id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        engine: vehicle.engine ?? null,
      }
    : null
}

/**
 * The page of a make's own code (BMW's 2A82) as a code page like any other:
 * the meaning in the same parts, the jobs here, shared fixes under the
 * code with its make (BMW-2A82), and every meaning the code has with where
 * the make uses it. `detail` is the first meaning; the page switches.
 */
export async function loadOemCodePage(
  organizationId: string,
  make: string,
  code: string,
  vehicleId: string | null | undefined,
  locale: string,
  options: { fixes?: boolean } = {}
): Promise<FaultCodePageData & { oem: NonNullable<FaultCodePageData['oem']> }> {
  const vehicle = await vehicleForCodes(organizationId, vehicleId)
  const connected = await faultCodesConnected(organizationId)
  const fixCode = oemFixCode(make, code)
  const [answer, jobs, fixes, oemMakes, research, waveforms] = await Promise.all([
    oemCodeFor(organizationId, make, code, vehicle, locale),
    jobsWithCode(organizationId, code, 20, make),
    options.fixes && connected
      ? fixesFor(organizationId, fixCode)
      : Promise.resolve<CodeFixes | null>(null),
    connected ? oemMakesFor(organizationId) : Promise.resolve([]),
    options.fixes && connected
      ? researchFor(organizationId, fixCode)
      : Promise.resolve<ResearchState | null>(null),
    options.fixes && connected
      ? waveformsFor(organizationId, fixCode)
      : Promise.resolve<CodeWaveforms | null>(null),
  ])
  const makeName = nameOfMake(make)
  return {
    code,
    connected,
    connectable: getManifest('torqvoice-codes') !== null,
    available: answer.available,
    detail: oemDetail(code, makeName, answer.meanings[0] ?? null),
    jobs,
    fixes,
    report: null,
    vehicle: codeVehicle(vehicle),
    oemMakes,
    research,
    waveforms,
    oem: { make, makeName, fixCode, served: answer.served, meanings: answer.meanings },
  }
}
