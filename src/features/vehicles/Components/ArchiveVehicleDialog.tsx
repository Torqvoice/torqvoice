'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { archiveVehicle } from '@/features/vehicles/Actions/archiveVehicle'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export function ArchiveVehicleDialog({
  open,
  onOpenChange,
  vehicleId,
  vehicleName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicleId: string
  vehicleName: string
}) {
  const router = useRouter()
  const t = useTranslations('vehicles.archiveDialog')
  const tc = useTranslations('common.buttons')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleArchive = async () => {
    setLoading(true)
    const result = await archiveVehicle(vehicleId, reason.trim() || undefined)
    setLoading(false)

    if (result.success) {
      toast.success(t('archived', { name: vehicleName }))
      setReason('')
      onOpenChange(false)
      router.refresh()
    } else {
      toast.error(result.error || t('archiveError'))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason('')
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t.rich('description', { name: vehicleName, span: (chunks) => <span className="font-medium">{chunks}</span> })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="archive-reason">{t('reasonLabel')}</Label>
          <Textarea
            id="archive-reason"
            placeholder={t('reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={handleArchive}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('title')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
