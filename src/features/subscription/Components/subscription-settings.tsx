'use client'

import { formatCurrency } from '@/lib/format'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { AppCard } from '@/components/app-card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Check,
  CheckCircle2,
  Crown,
  CreditCard,
  ExternalLink,
  Loader2,
  Shield,
  X,
  Zap,
  AlertTriangle,
} from 'lucide-react'
import {
  cancelSubscription,
  resumeSubscription,
} from '@/features/subscription/Actions/subscriptionActions'
import type { PlanFeatures } from '@/lib/features'
import type { BillingInterval, BillingPlan, BillingPriceList } from '@/lib/torqvoice-com'

type Props = {
  plan: string
  isDemo: boolean
  status: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  currentPeriodStart: string | null
  planPrice: number
  planInterval: string
  hasStripeCustomer: boolean
  /** Back from a completed checkout on torqvoice.com. */
  justPurchased: boolean
  /** Whether torqvoice.com is linked, so the account there can be opened signed in. */
  accountLinkAvailable: boolean
  usage: { customers: number; members: number }
  features: PlanFeatures
  /** Today's prices from torqvoice.com, or null when it could not be asked. */
  prices: BillingPriceList | null
}

export function SubscriptionSettings({
  plan,
  isDemo,
  status,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  currentPeriodStart,
  planPrice,
  planInterval,
  hasStripeCustomer,
  justPurchased,
  accountLinkAvailable,
  usage,
  features,
  prices,
}: Props) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const router = useRouter()
  const [checkoutLoading, setCheckoutLoading] = useState<BillingPlan | null>(null)
  const [interval, setInterval] = useState<BillingInterval>('year')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [billingLoading, setBillingLoading] = useState(false)
  const [accountLoading, setAccountLoading] = useState(false)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [upgradePreview, setUpgradePreview] = useState<{
    amountDue: number
    currency: string
    prorationDate: number
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const isPaid = plan === 'pro' || plan === 'enterprise'

  // Back from checkout before the row was written: the site records the
  // subscription on its success page and again from Stripe's webhook, so a
  // second look a few seconds later finds it. The customer sees a notice
  // rather than the buy buttons in the meantime.
  const activating = justPurchased && !isPaid
  useEffect(() => {
    if (!activating) return
    const timer = setTimeout(() => router.refresh(), 4_000)
    return () => clearTimeout(timer)
  }, [activating, router])
  const isCanceling = cancelAtPeriodEnd && status === 'active'
  const isPastDue = status === 'past_due'

  // Whole days left until a demo expires (0 once past the expiry date).
  const demoDaysRemaining =
    isDemo && currentPeriodEnd
      ? Math.max(0, Math.ceil((new Date(currentPeriodEnd).getTime() - Date.now()) / 86_400_000))
      : null

  const handleCheckout = async (selectedPlan: BillingPlan) => {
    setCheckoutLoading(selectedPlan)
    try {
      const res = await fetch('/api/protected/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, interval }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error ?? t('subscription.checkoutError'))
        setCheckoutLoading(null)
      }
    } catch {
      toast.error(t('subscription.checkoutError'))
      setCheckoutLoading(null)
    }
  }

  const handleUpgradeDialogOpen = async (open: boolean) => {
    if (!open) {
      setUpgradePreview(null)
      return
    }
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/protected/subscription/upgrade-preview', {
        method: 'POST',
      })
      const data = await res.json()
      if (data.amountDue !== undefined) {
        setUpgradePreview(data)
      } else {
        toast.error(data.error ?? t('subscription.upgradeError'))
      }
    } catch {
      toast.error(t('subscription.upgradeError'))
    }
    setPreviewLoading(false)
  }

  const handleUpgrade = async () => {
    setUpgradeLoading(true)
    try {
      const res = await fetch('/api/protected/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'enterprise',
          prorationDate: upgradePreview?.prorationDate,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(t('subscription.upgradeSuccess'))
        router.refresh()
      } else {
        toast.error(data.error ?? t('subscription.upgradeError'))
      }
    } catch {
      toast.error(t('subscription.upgradeError'))
    }
    setUpgradeLoading(false)
  }

  const handleCancel = async () => {
    setCancelLoading(true)
    const result = await cancelSubscription()
    if (result.success) {
      toast.success(t('subscription.cancelSuccess'))
      router.refresh()
    } else {
      toast.error(result.error ?? t('subscription.cancelError'))
    }
    setCancelLoading(false)
  }

  const handleResume = async () => {
    setResumeLoading(true)
    const result = await resumeSubscription()
    if (result.success) {
      toast.success(t('subscription.resumeSuccess'))
      router.refresh()
    } else {
      toast.error(result.error ?? t('subscription.resumeError'))
    }
    setResumeLoading(false)
  }

  const handleBillingPortal = async () => {
    setBillingLoading(true)
    try {
      const res = await fetch('/api/protected/subscription/billing-portal', {
        method: 'POST',
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error ?? t('subscription.billingPortalError'))
        setBillingLoading(false)
      }
    } catch {
      toast.error(t('subscription.billingPortalError'))
      setBillingLoading(false)
    }
  }

  const handleOpenAccount = async () => {
    setAccountLoading(true)
    try {
      const res = await fetch('/api/protected/subscription/account-link', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error ?? t('subscription.billingPortalError'))
        setAccountLoading(false)
      }
    } catch {
      toast.error(t('subscription.billingPortalError'))
      setAccountLoading(false)
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const intervalLabel =
    planInterval === 'month' ? t('subscription.perMonth') : t('subscription.perYear')

  // What a plan costs at the selected interval, quoted per month either way,
  // with the yearly total beside it for annual billing. Nothing is shown when
  // the site could not be asked; the checkout page states the price anyway.
  // Plan prices are shown the way the pricing page shows them ("$29",
  // "$24.17"), with the symbol, not as an accounting figure.
  const formatPrice = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  const priceLine = (selectedPlan: BillingPlan): string | null => {
    const price = prices?.[selectedPlan]?.[interval]
    if (!price) return null
    if (interval === 'month') {
      return `${formatPrice(price.amount, price.currency)}/${t('subscription.perMonth')}`
    }
    const perMonth = formatPrice(price.amount / 12, price.currency)
    return `${perMonth}/${t('subscription.perMonth')} · ${t('subscription.billedAnnually', {
      amount: formatPrice(price.amount, price.currency),
    })}`
  }

  // The annual saving against twelve monthly payments, from the Pro prices.
  const annualSaving = (() => {
    const monthly = prices?.pro?.month?.amount
    const yearly = prices?.pro?.year?.amount
    if (!monthly || !yearly) return 0
    return Math.round((1 - yearly / (monthly * 12)) * 100)
  })()
  const offers = (selectedInterval: BillingInterval) =>
    Boolean(prices?.pro?.[selectedInterval] || prices?.enterprise?.[selectedInterval])
  // Both intervals are offered unless the site said one is not for sale.
  const showIntervalSwitch = prices === null || (offers('month') && offers('year'))

  const planIcon =
    plan === 'enterprise' ? (
      <Crown className="h-5 w-5" />
    ) : plan === 'pro' ? (
      <Zap className="h-5 w-5" />
    ) : (
      <Shield className="h-5 w-5" />
    )

  const planBadge =
    plan === 'enterprise' ? (
      <Badge className="bg-purple-600 hover:bg-purple-700">
        {t('subscription.planEnterprise')}
      </Badge>
    ) : plan === 'pro' ? (
      <Badge className="bg-blue-600 hover:bg-blue-700">{t('subscription.planPro')}</Badge>
    ) : (
      <Badge variant="secondary">{t('subscription.planFree')}</Badge>
    )

  const statusBadge = isPastDue ? (
    <Badge variant="destructive">{t('subscription.statusPastDue')}</Badge>
  ) : isCanceling ? (
    <Badge variant="outline" className="border-yellow-500 text-yellow-600">
      {t('subscription.statusCanceling')}
    </Badge>
  ) : status === 'active' ? (
    <Badge variant="outline" className="border-green-500 text-green-600">
      {t('subscription.statusActive')}
    </Badge>
  ) : null

  // What the plan allows, in two shapes: the two counted limits as meters,
  // and the switches as one plain checklist, included first.
  const UNLIMITED = 999999
  const meters: { label: string; used: number; limit: number }[] = [
    {
      label: t('subscription.featureCustomers'),
      used: usage.customers,
      limit: features.maxCustomers,
    },
    { label: t('subscription.featureTeamMembers'), used: usage.members, limit: features.maxUsers },
  ]
  const switches: { label: string; on: boolean }[] = [
    { label: t('subscription.featureSmtp'), on: features.smtp },
    { label: t('subscription.featureApi'), on: features.api },
    { label: t('subscription.featurePayments'), on: features.payments },
    { label: t('subscription.featureCustomFields'), on: features.customFields },
    { label: t('subscription.featureSms'), on: features.sms },
    { label: t('subscription.featureCustomerPortal'), on: features.customerPortal },
    { label: t('subscription.featureCustomTemplates'), on: features.customTemplates },
    { label: t('subscription.featureBrandingRemoved'), on: features.brandingRemoved },
  ].sort((a, b) => Number(b.on) - Number(a.on))

  return (
    <div className="space-y-6">
      {/* Card 1: Current Plan */}
      <AppCard
        title={
          <span className="flex items-center gap-2">
            {planIcon} {t('subscription.title')}
          </span>
        }
        description={t('subscription.description')}
        contentClassName="space-y-4"
      >
        {justPurchased && isPaid && (
          <div className="flex items-center gap-2 rounded-md border border-green-500/50 bg-green-500/10 p-3">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-400">
              {t('subscription.purchaseSuccess')}
            </p>
          </div>
        )}

        {activating && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
            <Loader2 className="h-4 w-4 animate-spin text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t('subscription.purchaseActivating')}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Label>{t('subscription.currentPlan')}:</Label>
          {planBadge}
          {isDemo ? (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {t('subscription.demoBadge')}
            </Badge>
          ) : (
            statusBadge
          )}
        </div>

        {isDemo && currentPeriodEnd && (
          <div className="text-sm text-amber-600">
            {t('subscription.demoExpiresIn', {
              days: demoDaysRemaining ?? 0,
              date: formatDate(currentPeriodEnd),
            })}
          </div>
        )}

        {isPaid && !isDemo && planPrice > 0 && (
          <div className="text-sm text-muted-foreground">
            ${planPrice}/{intervalLabel}
          </div>
        )}

        {isPaid && !isDemo && currentPeriodStart && currentPeriodEnd && (
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('subscription.billingPeriod')}:</span>
              <span>
                {t('subscription.billingPeriodDates', {
                  start: formatDate(currentPeriodStart),
                  end: formatDate(currentPeriodEnd),
                })}
              </span>
            </div>
            {!isCanceling && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t('subscription.nextRenewal')}:</span>
                <span>{formatDate(currentPeriodEnd)}</span>
              </div>
            )}
          </div>
        )}

        {isPastDue && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{t('subscription.pastDueWarning')}</p>
          </div>
        )}

        {isCanceling && currentPeriodEnd && (
          <div className="flex items-center gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
            <p className="text-sm text-yellow-600">
              {t('subscription.cancelingWarning', { date: formatDate(currentPeriodEnd) })}
            </p>
          </div>
        )}
      </AppCard>

      {/* Upgrade, right under the current plan: it is what a free workshop opens this page for. */}
      {(plan === 'free' || isDemo) && !activating && (
        <AppCard
          title={t('subscription.upgradeTitle')}
          description={t('subscription.upgradeToProDescription')}
        >
          {showIntervalSwitch && (
            <div
              role="radiogroup"
              aria-label={t('subscription.billingInterval')}
              className="mb-4 inline-flex items-center rounded-full border bg-muted/40 p-1 text-sm"
            >
              {(['month', 'year'] as const).map((value) => {
                const active = interval === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setInterval(value)}
                    className={`flex items-center gap-2 rounded-full px-3 py-1 font-medium transition-colors ${
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {value === 'month'
                      ? t('subscription.billingMonthly')
                      : t('subscription.billingAnnual')}
                    {value === 'year' && annualSaving > 0 && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                        {t('subscription.billingSave', { percent: annualSaving })}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {(['pro', 'enterprise'] as const).map((offer) => {
              const line = priceLine(offer)
              const available = prices === null || Boolean(prices[offer]?.[interval])
              return (
                <div key={offer} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    {offer === 'pro' ? (
                      <Zap className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Crown className="h-4 w-4 text-purple-600" />
                    )}
                    <span className="text-sm font-medium">
                      {offer === 'pro'
                        ? t('subscription.planPro')
                        : t('subscription.planEnterprise')}
                    </span>
                  </div>
                  {line && <p className="text-sm text-muted-foreground">{line}</p>}
                  <Button
                    variant={offer === 'pro' ? 'default' : 'outline'}
                    size="sm"
                    className="mt-auto"
                    onClick={() => handleCheckout(offer)}
                    disabled={checkoutLoading !== null || !available}
                  >
                    {checkoutLoading === offer ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : offer === 'pro' ? (
                      <Zap className="mr-2 h-4 w-4" />
                    ) : (
                      <Crown className="mr-2 h-4 w-4" />
                    )}
                    {offer === 'pro'
                      ? t('subscription.upgradeToPro')
                      : t('subscription.upgradeToEnterprise')}
                  </Button>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t('subscription.checkoutOnTorqvoice')}
          </p>
        </AppCard>
      )}

      {/* Card 2: Plan Features */}
      <AppCard
        title={t('subscription.featuresTitle')}
        description={t('subscription.featuresDescription')}
        contentClassName="space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {meters.map((meter) => {
            const unlimited = meter.limit >= UNLIMITED
            const over = !unlimited && meter.used > meter.limit
            const share = unlimited ? 0 : Math.min(100, (meter.used / meter.limit) * 100)
            return (
              <div key={meter.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{meter.label}</span>
                  <span className={over ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                    {unlimited
                      ? t('subscription.usageUnlimited', { used: String(meter.used) })
                      : t('subscription.usageOf', {
                          used: String(meter.used),
                          limit: String(meter.limit),
                        })}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${over ? 'bg-destructive' : 'bg-primary'}`}
                    style={{ width: `${unlimited ? 100 : share}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <ul className="grid gap-x-6 gap-y-2 border-t pt-4 sm:grid-cols-2">
          {switches.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              {item.on ? (
                <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <X aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              )}
              <span className={item.on ? '' : 'text-muted-foreground'}>{item.label}</span>
              <span className="sr-only">
                {item.on ? t('subscription.included') : t('subscription.notIncluded')}
              </span>
            </li>
          ))}
        </ul>
      </AppCard>

      {/* Card 3: Manage Subscription — demos have no Stripe billing to manage */}
      {isPaid && !isDemo && (
        <AppCard
          title={t('subscription.manageTitle')}
          description={accountLinkAvailable ? t('subscription.accountOnTorqvoice') : undefined}
          contentClassName="flex flex-wrap gap-3"
        >
          {hasStripeCustomer && (
            <Button variant="outline" onClick={handleBillingPortal} disabled={billingLoading}>
              {billingLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              {t('subscription.manageBilling')}
            </Button>
          )}
          {accountLinkAvailable && (
            <Button variant="outline" onClick={handleOpenAccount} disabled={accountLoading}>
              {accountLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              {t('subscription.openTorqvoiceAccount')}
            </Button>
          )}

          {isCanceling ? (
            <Button variant="default" onClick={handleResume} disabled={resumeLoading}>
              {resumeLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('subscription.resumeSubscription')}
            </Button>
          ) : (
            status === 'active' &&
            !cancelAtPeriodEnd && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">{t('subscription.cancelSubscription')}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('subscription.cancelDialogTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('subscription.cancelDialogDescription', {
                        date: formatDate(currentPeriodEnd),
                      })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('subscription.cancelDialogCancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleCancel}
                      disabled={cancelLoading}
                    >
                      {cancelLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('subscription.cancelDialogConfirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )
          )}
        </AppCard>
      )}

      {plan === 'pro' && !isDemo && (
        <AppCard
          title={t('subscription.upgradeTitle')}
          description={t('subscription.upgradeToEnterpriseDescription')}
        >
          <AlertDialog onOpenChange={handleUpgradeDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={upgradeLoading}>
                {upgradeLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Crown className="mr-2 h-4 w-4" />
                )}
                {t('subscription.upgradeToEnterprise')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('subscription.upgradeDialogTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('subscription.upgradeDialogDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {previewLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('subscription.upgradeCalculating')}
                </div>
              )}
              {upgradePreview && (
                <div className="rounded-md border bg-muted/50 p-3 text-sm">
                  <p>
                    {t('subscription.upgradeAmountDue')}:{' '}
                    <span className="font-semibold">
                      {formatCurrency(
                        upgradePreview.amountDue,
                        upgradePreview.currency.toUpperCase(),
                        'code'
                      )}
                    </span>
                  </p>
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>{t('subscription.cancelDialogCancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleUpgrade}
                  disabled={upgradeLoading || previewLoading || !upgradePreview}
                >
                  {upgradeLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('subscription.upgradeConfirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </AppCard>
      )}
    </div>
  )
}
