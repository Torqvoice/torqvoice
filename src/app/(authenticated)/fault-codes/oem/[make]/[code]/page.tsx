import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { getOemFaultCode } from '@/features/fault-codes/Actions/getOemFaultCode'
import { FaultCodeOemView } from '@/features/fault-codes/Components/FaultCodeOemView'
import { normalizeMakeCode } from '@/features/fault-codes/Lib/codes'
import { isMakeKey } from '@/features/fault-codes/Lib/makes'
import { isSupportEnabled } from '@/lib/support'

/**
 * A make's own code's page (/fault-codes/oem/bmw/2A82, /fault-codes/oem/ford/P1000), laid out as every
 * code's page: the meaning, likely causes, shared fixes and the jobs here,
 * with where the make uses it and every meaning the code has. `?vehicle=<id>`
 * puts the meanings that fit that car first.
 */
export default async function OemFaultCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ make: string; code: string }>
  searchParams: Promise<{ vehicle?: string }>
}) {
  const [{ make, code: raw }, { vehicle }] = await Promise.all([params, searchParams])
  const source = make.toLowerCase()
  if (!isMakeKey(source)) notFound()
  const code = normalizeMakeCode(source, decodeURIComponent(raw))
  if (!code) notFound()
  // One address per code: 0x2a82 is 2A82, p1000 is P1000.
  if (code !== raw || source !== make)
    redirect(
      `/fault-codes/oem/${source}/${code}${vehicle ? `?vehicle=${encodeURIComponent(vehicle)}` : ''}`
    )

  const [result, supportEnabled] = await Promise.all([
    getOemFaultCode({ source, code, vehicleId: vehicle ?? null, fixes: true }),
    isSupportEnabled(),
  ])
  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="mx-auto w-full max-w-[100rem]">
          {result.success && result.data ? (
            <FaultCodeOemView
              key={code}
              data={result.data}
              layout="page"
              supportEnabled={supportEnabled}
            />
          ) : (
            <div className="flex h-[50vh] items-center justify-center">
              <p className="text-muted-foreground">{result.error}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
