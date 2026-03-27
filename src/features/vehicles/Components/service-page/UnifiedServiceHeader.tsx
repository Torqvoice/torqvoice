'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Download,
  Globe,
  Loader2,
  Mail,
  Save,
  Trash2,
} from 'lucide-react'
import { statusColors, paymentStatusColors, paymentStatusLabels } from '../service-detail/types'

export type ServiceTab = 'details' | 'images' | 'video' | 'documents' | 'statusReports'

export interface TabCounts {
  images: number
  video: number
  documents: number
  statusReports: number
}

interface UnifiedServiceHeaderProps {
  vehicleId: string
  vehicleName: string
  title: string
  status: string
  paymentStatus: string
  activeTab: ServiceTab
  onTabChange: (tab: ServiceTab) => void
  tabCounts: TabCounts
  downloading: boolean
  saving: boolean
  hasUnsavedChanges?: boolean
  showSaved?: boolean
  onDownloadPDF: () => void
  onDelete: () => void
  onShowEmail: () => void
  onShowShare: () => void
}

export function UnifiedServiceHeader({
  vehicleId,
  vehicleName,
  title,
  status,
  paymentStatus,
  activeTab,
  onTabChange,
  tabCounts,
  downloading,
  saving,
  hasUnsavedChanges = false,
  showSaved = false,
  onDownloadPDF,
  onDelete,
  onShowEmail,
  onShowShare,
}: UnifiedServiceHeaderProps) {
  const t = useTranslations('service.header')
  const tabs: { label: string; value: ServiceTab }[] = [
    { label: t('tabs.details'), value: 'details' },
    { label: t('tabs.images'), value: 'images' },
    { label: t('tabs.video'), value: 'video' },
    { label: t('tabs.documents'), value: 'documents' },
    { label: t('tabs.statusReports'), value: 'statusReports' },
  ]

  return (
    <div className="shrink-0 border-b bg-background px-4 pt-2 pb-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/vehicles/${vehicleId}`}
          className="flex min-w-0 items-center gap-3 text-foreground transition-colors hover:text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={`shrink-0 text-xs ${paymentStatusColors[paymentStatus] || ''}`}
              >
                {paymentStatusLabels[paymentStatus] || t('unpaid')}
              </Badge>
              <Badge
                variant="outline"
                className={`shrink-0 text-xs ${statusColors[status] || ''}`}
              >
                {status}
              </Badge>
              <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
            </div>
            <p className="truncate text-xs text-muted-foreground">{vehicleName}</p>
          </div>
        </Link>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {activeTab === 'details' && (
            <>
              {hasUnsavedChanges && (
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('unsavedChanges')}</span>
              )}
              {showSaved && !hasUnsavedChanges && (
                <span className="text-xs font-medium text-green-600 dark:text-green-400">{t('saved')}</span>
              )}
              <Button type="submit" form="service-record-form" size="sm" disabled={saving} variant={hasUnsavedChanges ? "default" : "outline"} className={hasUnsavedChanges ? "animate-pulse" : ""}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" />
                ) : (
                  <Save className="h-3.5 w-3.5 sm:mr-1" />
                )}
                <span className="hidden sm:inline">{t('save')}</span>
              </Button>
            </>
          )}
          <ButtonGroup>
            <Button variant="outline" size="sm" onClick={onDownloadPDF} disabled={downloading}>
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" />
              ) : (
                <Download className="h-3.5 w-3.5 sm:mr-1" />
              )}
              <span className="hidden sm:inline">{t('pdf')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onShowEmail}>
              <Mail className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t('email')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onShowShare}>
              <Globe className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t('share')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t('delete')}</span>
            </Button>
          </ButtonGroup>
        </div>
      </div>
      <nav className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onTabChange(tab.value)}
            className={cn(
              'cursor-pointer px-3 py-1.5 text-sm font-medium transition-colors -mb-px border-b-2',
              activeTab === tab.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
            )}
          >
            {tab.label}
            {tab.value !== 'details' && tabCounts[tab.value] > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({tabCounts[tab.value]})</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
