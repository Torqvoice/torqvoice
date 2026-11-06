'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { getFaultCodeDetail } from '../Actions/getFaultCodeDetail'
import { getOemFaultCode } from '../Actions/getOemFaultCode'
import { isFaultCode, isOemCode } from '../Lib/codes'
import { FaultCodeOemView, type OemCodePageData } from './FaultCodeOemView'
import type { FaultCodePageData } from '../Lib/types'
import { FaultCodeDetail } from './FaultCodeDetail'

/**
 * The code sheet: a code opened from a finding, beside the job it was read
 * on, so the meaning is for that vehicle's make. A related code opens in
 * the same sheet; the code's own page is a link away.
 */
export function FaultCodeSheet({
  code,
  vehicleId,
  oemSource = null,
  onOpenChange,
}: {
  /** The code to show; null keeps the sheet closed. */
  code: string | null
  vehicleId?: string | null
  /** The car's manufacturer data ("bmw"): its own codes open the manufacturer view. */
  oemSource?: string | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('faultCodes')
  const [shown, setShown] = useState<string | null>(code)
  const [data, setData] = useState<FaultCodePageData | null>(null)
  const [oem, setOem] = useState<OemCodePageData | null>(null)
  const oemCode = oemSource && shown && !isFaultCode(shown) && isOemCode(shown) ? shown : null
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setShown(code)
  }, [code])

  useEffect(() => {
    if (!shown) return
    let cancelled = false
    setData(null)
    setOem(null)
    setFailed(false)
    if (oemCode && oemSource === 'bmw') {
      getOemFaultCode({ source: oemSource, code: oemCode, vehicleId: vehicleId ?? null }).then(
        (result) => {
          if (cancelled) return
          if (result.success && result.data) setOem(result.data)
          else setFailed(true)
        }
      )
    } else {
      getFaultCodeDetail({ code: shown, vehicleId: vehicleId ?? null }).then((result) => {
        if (cancelled) return
        if (result.success && result.data) setData(result.data)
        else setFailed(true)
      })
    }
    return () => {
      cancelled = true
    }
  }, [shown, vehicleId, oemCode, oemSource])

  return (
    <Sheet open={code !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{shown ?? t('title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('sheet.description')}</SheetDescription>
        </SheetHeader>
        <div className="p-4">
          {oem && oem.code === shown ? (
            <FaultCodeOemView data={oem} />
          ) : data && data.code === shown ? (
            <FaultCodeDetail key={data.code} data={data} onOpenCode={setShown} />
          ) : failed ? (
            <p className="text-sm text-muted-foreground">{t('sheet.loadFailed')}</p>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('sheet.loading')}
            </div>
          )}
        </div>
        {shown && (
          <div className="mt-auto border-t p-4">
            <Button asChild variant="outline" size="sm">
              <Link
                href={`${
                  oem && oem.code === shown
                    ? `/fault-codes/oem/${oem.oem.make}/${shown}`
                    : `/fault-codes/${shown}`
                }${vehicleId ? `?vehicle=${vehicleId}` : ''}`}
              >
                <ExternalLink />
                {t('sheet.openPage')}
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
