'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Boxes,
  Building2,
  Car,
  ClipboardCheck,
  CreditCard,
  FileText,
  Users,
  Wrench,
} from 'lucide-react'
import { useFormatDate } from '@/lib/use-format-date'

type OrgDetails = {
  id: string
  name: string
  createdAt: string
  subscription: {
    status: string
    planName: string
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  } | null
  stats: {
    members: number
    vehicles: number
    customers: number
    workOrders: number
    quotes: number
    inspections: number
    inventoryParts: number
  }
  owner: {
    id: string
    name: string
    email: string
    role: string
  } | null
  members: Array<{
    id: string
    name: string
    email: string
    role: string
    lastSeen: string | null
  }>
}

function subscriptionVariant(status: string) {
  switch (status) {
    case 'active':
      return 'default' as const
    case 'trialing':
      return 'secondary' as const
    case 'past_due':
      return 'destructive' as const
    case 'canceled':
      return 'outline' as const
    default:
      return 'secondary' as const
  }
}

export function AdminOrganizationDetails({ org }: { org: OrgDetails }) {
  const t = useTranslations('admin')
  const { formatDate, formatDateTime } = useFormatDate()

  const statCards = [
    { key: 'vehicles', label: t('orgDetails.vehicles'), value: org.stats.vehicles, icon: Car },
    {
      key: 'workOrders',
      label: t('orgDetails.workOrders'),
      value: org.stats.workOrders,
      icon: Wrench,
    },
    { key: 'customers', label: t('orgDetails.customers'), value: org.stats.customers, icon: Users },
    { key: 'quotes', label: t('orgDetails.quotes'), value: org.stats.quotes, icon: FileText },
    {
      key: 'inspections',
      label: t('orgDetails.inspections'),
      value: org.stats.inspections,
      icon: ClipboardCheck,
    },
    {
      key: 'inventoryParts',
      label: t('orgDetails.inventoryParts'),
      value: org.stats.inventoryParts,
      icon: Boxes,
    },
  ]

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('orgDetails.back')}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            {org.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">{t('users.created')}</p>
            <p className="font-medium">{formatDate(org.createdAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('orgDetails.owner')}</p>
            {org.owner ? (
              <Link href={`/admin/users/${org.owner.id}`} className="font-medium hover:underline">
                {org.owner.name} <span className="text-muted-foreground">({org.owner.email})</span>
              </Link>
            ) : (
              <p className="text-muted-foreground">{t('orgDetails.noOwner')}</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-muted-foreground">{t('orgDetails.subscription')}</p>
            {org.subscription ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={subscriptionVariant(org.subscription.status)}>
                  {org.subscription.status}
                </Badge>
                <span className="text-sm font-medium">{org.subscription.planName}</span>
                {org.subscription.currentPeriodEnd && (
                  <span className="text-xs text-muted-foreground">
                    {org.subscription.cancelAtPeriodEnd
                      ? t('orgDetails.cancelsAt')
                      : t('orgDetails.renews')}
                    : {formatDate(org.subscription.currentPeriodEnd)}
                  </span>
                )}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5" />
                {t('orgDetails.noSubscription')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((s) => (
          <Card key={s.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t('orgDetails.members')}{' '}
          <span className="text-sm font-normal text-muted-foreground">({org.stats.members})</span>
        </h2>
        <Card>
          <CardContent className="divide-y p-0">
            {org.members.map((m) => (
              <Link
                key={m.id}
                href={`/admin/users/${m.id}`}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50"
              >
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.lastSeen && (
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {formatDateTime(m.lastSeen)}
                    </span>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {m.role}
                  </Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
