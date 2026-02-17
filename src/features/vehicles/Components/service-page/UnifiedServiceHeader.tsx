'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

export type ServiceTab = 'details' | 'images' | 'video' | 'documents'

interface UnifiedServiceHeaderProps {
  vehicleId: string
  vehicleName: string
  title: string
  status: string
  paymentStatus: string
  activeTab: ServiceTab
  onTabChange: (tab: ServiceTab) => void
  downloading: boolean
  saving: boolean
  onDownloadPDF: () => void
  onDelete: () => void
  onShowEmail: () => void
  onShowShare: () => void
}

const tabs: { label: string; value: ServiceTab }[] = [
  { label: 'Details', value: 'details' },
  { label: 'Images', value: 'images' },
  { label: 'Video', value: 'video' },
  { label: 'Documents', value: 'documents' },
]

export function UnifiedServiceHeader({
  vehicleId,
  vehicleName,
  title,
  status,
  paymentStatus,
  activeTab,
  onTabChange,
  downloading,
  saving,
  onDownloadPDF,
  onDelete,
  onShowEmail,
  onShowShare,
}: UnifiedServiceHeaderProps) {
  return (
    <div className="shrink-0 border-b bg-background px-4 pt-2 pb-0">
      <div className="mb-2 flex items-center justify-between">
        <Link
          href={`/vehicles/${vehicleId}`}
          className="flex min-w-0 items-center gap-3 text-foreground transition-colors hover:text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`shrink-0 text-xs ${paymentStatusColors[paymentStatus] || ''}`}
              >
                {paymentStatusLabels[paymentStatus] || 'Unpaid'}
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
        <div className="flex shrink-0 items-center gap-2">
          {activeTab === 'details' && (
            <Button type="submit" form="service-record-form" size="sm" disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Save
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onDownloadPDF} disabled={downloading}>
            {downloading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1 h-3.5 w-3.5" />
            )}
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={onShowEmail}>
            <Mail className="mr-1 h-3.5 w-3.5" />
            Email
          </Button>
          <Button variant="outline" size="sm" onClick={onShowShare}>
            <Globe className="mr-1 h-3.5 w-3.5" />
            Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>
      <nav className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onTabChange(tab.value)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium transition-colors -mb-px border-b-2',
              activeTab === tab.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
