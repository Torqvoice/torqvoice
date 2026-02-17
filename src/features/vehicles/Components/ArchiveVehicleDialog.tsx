'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleArchive = async () => {
    setLoading(true)
    const result = await archiveVehicle(vehicleId, reason.trim() || undefined)
    setLoading(false)

    if (result.success) {
      toast.success(`${vehicleName} archived`)
      setReason('')
      onOpenChange(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to archive vehicle')
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
          <DialogTitle>Archive Vehicle</DialogTitle>
          <DialogDescription>
            Archive <span className="font-medium">{vehicleName}</span>? It will be hidden from the
            main list but all service history will be preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="archive-reason">Reason (optional)</Label>
          <Textarea
            id="archive-reason"
            placeholder="e.g. Sold, totaled, decommissioned..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={handleArchive}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
