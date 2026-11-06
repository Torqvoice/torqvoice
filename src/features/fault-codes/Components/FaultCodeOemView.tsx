'use client'

import { useMemo, useState } from 'react'
import { oemDetail } from '../Lib/oem'
import type { FaultCodePageData, OemPageData } from '../Lib/types'
import { FaultCodeDetail } from './FaultCodeDetail'

export type OemCodePageData = FaultCodePageData & { oem: OemPageData }

/**
 * A make's own code (BMW's 2A82) on the same page and sheet as every other
 * code: the meaning, likely causes, shared fixes and the jobs here, plus
 * where the make uses it. A code with several meanings shows one at a time,
 * the one fitting the job's car first, and switches in place.
 */
export function FaultCodeOemView({
  data,
  layout = 'sheet',
  supportEnabled = false,
}: {
  data: OemCodePageData
  layout?: 'sheet' | 'page'
  supportEnabled?: boolean
}) {
  const { meanings } = data.oem
  const [selected, setSelected] = useState(meanings[0]?.id ?? '')
  const meaning = meanings.find((m) => m.id === selected) ?? meanings[0] ?? null
  const detail = useMemo(
    () => oemDetail(data.code, data.oem.makeName, meaning),
    [data.code, data.oem.makeName, meaning]
  )
  return (
    <FaultCodeDetail
      data={{ ...data, detail }}
      layout={layout}
      supportEnabled={supportEnabled}
      oem={{ data: data.oem, meaning, onSelect: setSelected }}
    />
  )
}
