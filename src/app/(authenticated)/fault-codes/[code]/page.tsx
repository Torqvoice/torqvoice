import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/page-header'
import { getFaultCodeDetail } from '@/features/fault-codes/Actions/getFaultCodeDetail'
import { FaultCodeDetail } from '@/features/fault-codes/Components/FaultCodeDetail'
import { normalizeFaultCode } from '@/features/fault-codes/Lib/codes'
import { isSupportEnabled } from '@/lib/support'

/**
 * One fault code's own page, so search results and links have an address.
 * `?vehicle=<id>` reads the meaning for that vehicle's make, and a fix
 * shared from here carries that vehicle's make, model, year and engine.
 */
export default async function FaultCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ vehicle?: string }>
}) {
  const [{ code: raw }, { vehicle }] = await Promise.all([params, searchParams])
  const code = normalizeFaultCode(decodeURIComponent(raw))
  if (!code) {
    const t = await getTranslations('faultCodes.page')
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] flex-col items-center justify-center gap-1 px-4 text-center">
          <p className="font-medium">
            {t('notACode', { text: decodeURIComponent(raw).slice(0, 40) })}
          </p>
          <p className="text-sm text-muted-foreground">{t('notACodeHint')}</p>
        </div>
      </>
    )
  }
  // One address per code: p0420 is P0420.
  if (code !== raw)
    redirect(`/fault-codes/${code}${vehicle ? `?vehicle=${encodeURIComponent(vehicle)}` : ''}`)

  const [result, supportEnabled] = await Promise.all([
    getFaultCodeDetail({ code, vehicleId: vehicle ?? null, fixes: true }),
    isSupportEnabled(),
  ])
  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="mx-auto w-full max-w-[100rem]">
          <FaultCodeDetail
            key={code}
            data={result.data}
            layout="page"
            supportEnabled={supportEnabled}
          />
        </div>
      </div>
    </>
  )
}
