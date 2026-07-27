'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Car,
  ChevronRight,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useFormatDate } from '@/lib/use-format-date'

type Organization = {
  id: string
  name: string
  createdAt: string
  role: string
  memberCount: number
  vehicleCount: number
}

type UserDetails = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  isSuperAdmin: boolean
  image: string | null
  createdAt: string
  lastSeen: string | null
  lastLogin: string | null
  organizations: Organization[]
}

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000
}

export function AdminUserDetails({ user }: { user: UserDetails }) {
  const t = useTranslations('admin')
  const { formatDate, formatDateTime } = useFormatDate()
  const online = isOnline(user.lastSeen)

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('userDetails.back')}
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {user.name}
              {user.emailVerified && (
                <span title={t('users.emailVerified')}>
                  <BadgeCheck className="h-4 w-4 text-blue-500" />
                </span>
              )}
              {online && (
                <span className="relative flex h-2 w-2" title={t('users.online')}>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
              )}
            </CardTitle>
            {user.isSuperAdmin ? (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                {t('users.superAdmin')}
              </Badge>
            ) : (
              <Badge variant="secondary">{t('users.user')}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">{t('users.email')}</p>
            <p className="font-medium">{user.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('users.created')}</p>
            <p className="font-medium">{formatDate(user.createdAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('users.lastSeen')}</p>
            <p className="font-medium">
              {user.lastSeen ? formatDateTime(user.lastSeen) : t('userDetails.never')}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('userDetails.lastLogin')}</p>
            <p className="font-medium">
              {user.lastLogin ? formatDateTime(user.lastLogin) : t('userDetails.never')}
            </p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">{t('userDetails.organizations')}</h2>
        {user.organizations.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t('userDetails.noOrganizations')}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {user.organizations.map((org) => (
              <Link key={org.id} href={`/admin/organizations/${org.id}`}>
                <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {org.name}
                      </CardTitle>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t('userDetails.role')}</span>
                      <Badge variant="outline" className="text-xs">
                        {org.role}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {t('orgDetails.members')}
                      </span>
                      <span className="font-medium">{org.memberCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Car className="h-3.5 w-3.5" />
                        {t('orgDetails.vehicles')}
                      </span>
                      <span className="font-medium">{org.vehicleCount}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
