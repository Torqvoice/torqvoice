'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'
import { Check, CheckCircle2, Copy, Loader2, QrCode, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { generatePublicLink } from '@/features/vehicles/Actions/serviceActions'
import { getPaidTotal } from '@/features/payments/Actions/paymentActions'

/** How often the dialog asks whether the customer has paid. */
const POLL_MS = 4_000

/**
 * "Pay code": the invoice's own share link as a QR code, for the customer
 * standing at the desk. They scan it, the invoice opens on their phone, and
 * they pay there with whatever the workshop has connected. Nothing new is
 * built behind it: it is the link "Send to customer" makes, shown instead of
 * sent, so it follows the same rule and showing it for the first time shares
 * the invoice. That is said before the link is made, not after.
 *
 * While the code is up the dialog watches for the payment, which a vendor's
 * webhook books, and says so when it lands: the desk should not have to
 * reload a page to find out the customer is done.
 *
 * Only offered where online payment is connected; without it the link opens
 * an invoice with no way to pay, which is what "Send to customer" is for.
 */
export function PayCodeButton({
  serviceRecordId,
  organizationId,
  publicToken,
  balance,
  currencyCode,
  size = 'sm',
  className,
}: {
  serviceRecordId: string
  organizationId: string
  publicToken: string | null
  balance: number
  currencyCode: string
  size?: 'sm' | 'default'
  className?: string
}) {
  const t = useTranslations('service.payCode')
  const router = useRouter()
  const formatCurrency = useFormatCurrency()
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState(publicToken)
  const [making, setMaking] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [paidNow, setPaidNow] = useState(false)
  const paidAtOpen = useRef<number | null>(null)

  useEffect(() => setToken(publicToken), [publicToken])

  useEffect(() => {
    if (open) return
    setFailed(false)
    setPaidNow(false)
    paidAtOpen.current = null
  }, [open])

  // Watch for the payment while the code is on screen.
  useEffect(() => {
    if (!open || !token || paidNow) return
    let cancelled = false
    const ask = async () => {
      const result = await getPaidTotal(serviceRecordId).catch(() => null)
      if (cancelled || !result?.success || !result.data) return
      if (paidAtOpen.current === null) {
        paidAtOpen.current = result.data.paid
        return
      }
      if (result.data.paid > paidAtOpen.current) {
        setPaidNow(true)
        router.refresh()
      }
    }
    void ask()
    const timer = setInterval(ask, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [open, token, paidNow, serviceRecordId, router])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const url =
    token && typeof window !== 'undefined'
      ? `${window.location.origin}/share/invoice/${organizationId}/${token}`
      : null

  const makeLink = async () => {
    setMaking(true)
    setFailed(false)
    const result = await generatePublicLink(serviceRecordId)
    setMaking(false)
    if (result.success && result.data) {
      setToken(result.data.token)
      router.refresh()
    } else {
      setFailed(true)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        data-testid="pay-code-open"
      >
        <QrCode className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t('button')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="pay-code-dialog">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('body')}</DialogDescription>
          </DialogHeader>

          {paidNow ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-14 w-14 text-emerald-600 dark:text-emerald-400" />
              <p className="text-lg font-semibold">{t('paid')}</p>
              <p className="text-sm text-muted-foreground">{t('paidBody')}</p>
              <Button type="button" onClick={() => setOpen(false)}>
                {t('done')}
              </Button>
            </div>
          ) : !url ? (
            // Not shared yet. Showing the code shares it, so that is said
            // first and the link is only made on a deliberate click.
            <div className="space-y-4">
              <div className="flex gap-3 rounded-lg border border-card-edge bg-muted/40 p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('sharesInvoice')}</p>
              </div>
              {failed && <p className="text-sm text-destructive">{t('failed')}</p>}
              <Button type="button" className="w-full" onClick={makeLink} disabled={making}>
                {making && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('show')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('toPay')}
                </p>
                <p className="order-number text-3xl font-bold tabular-nums">
                  {formatCurrency(Math.max(0, balance), currencyCode)}
                </p>
              </div>
              {/* White behind the code in either theme: a phone camera reads
                  dark on light. */}
              <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.25)] ring-1 ring-black/5">
                <QRCodeSVG value={url} size={220} marginSize={0} />
              </div>
              <p className="text-xs font-medium text-muted-foreground">{t('scanHint')}</p>
              <div className="flex w-full items-center gap-1">
                <input
                  readOnly
                  value={url}
                  aria-label={t('copyLink')}
                  onFocus={(e) => e.target.select()}
                  className="min-w-0 flex-1 truncate rounded-md border border-input bg-background px-2 py-1.5 font-mono text-[11px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={copied ? t('linkCopied') : t('copyLink')}
                  title={copied ? t('linkCopied') : t('copyLink')}
                  onClick={() => {
                    navigator.clipboard
                      .writeText(url)
                      .then(() => setCopied(true))
                      .catch(() => undefined)
                  }}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                {t('waiting')}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
