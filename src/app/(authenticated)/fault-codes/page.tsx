import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { getFaultCodeOverview } from '@/features/fault-codes/Actions/getFaultCodeOverview'
import { FaultCodeLookup } from '@/features/fault-codes/Components/FaultCodeLookup'
import { normalizeFaultCode } from '@/features/fault-codes/Lib/codes'
import { isSupportEnabled } from '@/lib/support'

/**
 * Fault codes: a lookup box for a code or for words, the meanings that match
 * the words, this person's recent lookups and the codes read lately in this
 * workshop.
 */
export default async function FaultCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  // A code typed in the address bar or the palette goes straight to its page.
  const code = normalizeFaultCode(q)
  if (code) redirect(`/fault-codes/${code}`)

  const [result, supportEnabled] = await Promise.all([
    getFaultCodeOverview({ query: q.slice(0, 100) }),
    isSupportEnabled(),
  ])
  // So does a make's own code (BMW's 283700) that one make has.
  const oemHits = result.success ? (result.data?.oemHits ?? []) : []
  if (oemHits.length === 1 && oemHits[0].code === q.trim().toUpperCase())
    redirect(`/fault-codes/oem/${oemHits[0].make}/${oemHits[0].code}`)

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
        <FaultCodeLookup overview={result.data} supportEnabled={supportEnabled} />
      </div>
    </>
  )
}
