'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Download, Globe, Loader2, Mail, Pencil, Trash2 } from 'lucide-react'
import { statusColors, paymentStatusColors, paymentStatusLabels } from './types'

interface ServiceDetailHeaderProps {
  vehicleId: string
  recordId: string
  title: string
  status: string
  serviceDate: string
  shopName: string | null
  techName: string | null
  paymentStatus: string
  downloading: boolean
  onDownloadPDF: () => void
  onDelete: () => void
  onShowEmail: () => void
  onShowShare: () => void
}

export function ServiceDetailHeader({
  vehicleId,
  recordId,
  title,
  status,
  serviceDate,
  shopName,
  techName,
  paymentStatus,
  downloading,
  onDownloadPDF,
  onDelete,
  onShowEmail,
  onShowShare,
}: ServiceDetailHeaderProps) {
  return (
    <div className="shrink-0 border-b bg-background px-4 pt-2 pb-2">
      <div className="grid grid-cols-[1fr_auto] items-center gap-4">
        <Link
          href={`/vehicles/${vehicleId}`}
          className="flex items-center gap-3 overflow-hidden text-foreground transition-colors hover:text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`shrink-0 text-xs ${paymentStatusColors[paymentStatus] || ''}`}
              >
                {paymentStatusLabels[paymentStatus] || 'Unpaid'}
              </Badge>
              <Badge variant="outline" className={`shrink-0 text-xs ${statusColors[status] || ''}`}>
                {status}
              </Badge>
              <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {serviceDate}
              {shopName && ` · ${shopName}`}
              {techName && ` · Tech: ${techName}`}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/vehicles/${vehicleId}/service/${recordId}/edit`}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Link>
          </Button>
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
    </div>
  )
}
