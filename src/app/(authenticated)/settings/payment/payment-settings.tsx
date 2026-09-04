'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import type { PaymentConnectionSummary } from '@/features/integrations/Actions/integrationActions'
import {
  ArrowRight,
  Banknote,
  CreditCard,
  FileText,
  Loader2,
  Save,
  Copy,
  Check,
} from 'lucide-react'
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from '../read-only-guard'

/**
 * What prints on the invoice and what a customer agrees to. The vendors a
 * customer can pay through live in the integrations catalog now, so this
 * page only shows where each one stands and links across.
 */
export function PaymentSettings({
  settings,
  orgId,
  providers,
}: {
  settings: Record<string, string>
  orgId: string
  providers: PaymentConnectionSummary[]
}) {
  const router = useRouter()
  const t = useTranslations('settings')
  const ti = useTranslations('integrations')
  const [saving, setSaving] = useState(false)

  const [bankAccount, setBankAccount] = useState(settings[SETTING_KEYS.INVOICE_BANK_ACCOUNT] || '')
  const [paymentTerms, setPaymentTerms] = useState(
    settings[SETTING_KEYS.INVOICE_PAYMENT_TERMS] || ''
  )
  const [termsOfSale, setTermsOfSale] = useState(settings[SETTING_KEYS.PAYMENT_TERMS_OF_SALE] || '')
  const [termsOfSaleUrl, setTermsOfSaleUrl] = useState(
    settings[SETTING_KEYS.PAYMENT_TERMS_OF_SALE_URL] || ''
  )

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [appUrl, setAppUrl] = useState('')

  useEffect(() => {
    setAppUrl(window.location.origin)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await setSettings({
      [SETTING_KEYS.INVOICE_BANK_ACCOUNT]: bankAccount,
      [SETTING_KEYS.INVOICE_PAYMENT_TERMS]: paymentTerms,
      [SETTING_KEYS.PAYMENT_TERMS_OF_SALE]: termsOfSale,
      [SETTING_KEYS.PAYMENT_TERMS_OF_SALE_URL]: termsOfSaleUrl,
    })
    setSaving(false)
    router.refresh()
    toast.success(t('payment.saved'))
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  const publicTermsUrl = `${appUrl}/share/terms/${orgId}`

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <AppCard
          icon={Banknote}
          title={t('payment.detailsTitle')}
          action={
            <a
              href="https://torqvoice.com/docs/configuration/payment-providers"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('payment.readMore')} →
            </a>
          }
          contentClassName="space-y-6"
        >
          <p className="text-sm text-muted-foreground">{t('payment.detailsDescription')}</p>

          <div className="space-y-2">
            <Label htmlFor="bankAccount">{t('payment.bankAccount')}</Label>
            <Textarea
              id="bankAccount"
              rows={3}
              placeholder={t('payment.bankAccountPlaceholder')}
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('payment.bankAccountHint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentTerms">{t('payment.paymentTerms')}</Label>
            <Input
              id="paymentTerms"
              placeholder={t('payment.paymentTermsPlaceholder')}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('payment.paymentTermsHint')}</p>
          </div>
        </AppCard>

        <AppCard icon={CreditCard} title={t('payment.onlinePayments')} contentClassName="space-y-4">
          <p className="text-sm text-muted-foreground">{t('payment.onlinePaymentsDescription')}</p>

          <ul className="divide-y rounded-lg border">
            {providers.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <Image
                  src={p.logo}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-md"
                />
                <span className="min-w-0 flex-1 text-sm font-medium">{p.name}</span>
                {p.status === 'active' ? (
                  <Badge variant={p.offered ? 'default' : 'secondary'}>
                    {p.offered ? t('payment.offered') : t('payment.paused')}
                  </Badge>
                ) : p.status ? (
                  <Badge variant="outline">{ti(`statuses.${p.status}`)}</Badge>
                ) : null}
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/settings/integrations/${p.id}`}>
                    {p.status ? ti('catalog.manage') : ti('catalog.connect')}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">{t('payment.onlinePaymentsHint')}</p>
        </AppCard>

        <AppCard icon={FileText} title={t('payment.termsOfSale')} contentClassName="space-y-4">
          <p className="text-sm text-muted-foreground">{t('payment.termsOfSaleDescription')}</p>

          <div className="space-y-2">
            <Label htmlFor="termsOfSale">{t('payment.termsOfSaleText')}</Label>
            <Textarea
              id="termsOfSale"
              rows={10}
              placeholder={
                '1. Parties\n2. Payment\n3. Delivery\n4. Right of withdrawal\n5. Returns\n6. Complaints\n7. Disputes'
              }
              value={termsOfSale}
              onChange={(e) => setTermsOfSale(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="termsOfSaleUrl">{t('payment.externalTermsUrl')}</Label>
            <Input
              id="termsOfSaleUrl"
              type="url"
              placeholder="https://example.com/terms"
              value={termsOfSaleUrl}
              onChange={(e) => setTermsOfSaleUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('payment.externalTermsUrlHint')}</p>
          </div>

          {!termsOfSaleUrl && termsOfSale && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('payment.publicTermsUrl')}</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">
                  {publicTermsUrl}
                </code>
                <Button variant="outline" size="sm" onClick={() => copyUrl(publicTermsUrl)}>
                  {copiedUrl === publicTermsUrl ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('payment.publicTermsUrlHint')}</p>
            </div>
          )}

          <SaveButton>
            <Separator />
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('payment.savePayment')}
              </Button>
            </div>
          </SaveButton>
        </AppCard>
      </ReadOnlyWrapper>
    </div>
  )
}
