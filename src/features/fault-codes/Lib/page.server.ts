import 'server-only'
import {
  codeDetailFor,
  faultCodesConnected,
  fixesFor,
  jobsWithCode,
  reportStates,
  vehicleForCodes,
} from './service.server'
import { getManifest } from '@/integrations/registry'
import type { CodeFixes, FaultCodePageData, ReportState } from './types'

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
  const [detail, jobs, reports, fixes] = await Promise.all([
    codeDetailFor(organizationId, code, vehicle, locale),
    jobsWithCode(organizationId, code),
    connected ? reportStates(organizationId, [code]) : Promise.resolve({}),
    options.fixes && connected
      ? fixesFor(organizationId, code)
      : Promise.resolve<CodeFixes | null>(null),
  ])
  return {
    code,
    connected,
    connectable: getManifest('torqvoice-codes') !== null,
    available: detail.available,
    detail: detail.detail,
    jobs,
    fixes,
    report: (reports as Record<string, ReportState>)[code] ?? null,
    vehicle: vehicle
      ? {
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          engine: vehicle.engine ?? null,
        }
      : null,
  }
}
