'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FindingForm } from '../FindingForm'

interface Observation {
  id: string
  description: string
  severity: string
  notes: string | null
  serviceRecordId: string | null
}

interface Finding {
  id: string
  description: string
  severity: string
  status: string
  notes: string | null
}

export interface ObservationsControls {
  onAddFinding: () => void
  onEditFinding: (finding: Finding) => void
  openObservationsCount: number
  onShowExistingObservations: () => void
}

interface ObservationsManagerProps {
  vehicleId: string
  serviceRecordId: string
  openObservations: Observation[]
  onAddObservations: (selectedIds: string[]) => Promise<void>
  addingObservations: boolean
  onControlsReady: (controls: ObservationsControls) => void
}

export function ObservationsManager({
  vehicleId,
  serviceRecordId,
  openObservations,
  onAddObservations,
  addingObservations,
  onControlsReady,
}: ObservationsManagerProps) {
  const tf = useTranslations('vehicles.findings')
  const [openFindingForm, setOpenFindingForm] = useState(false)
  const [editingFinding, setEditingFinding] = useState<Finding | undefined>()
  const [showExistingDialog, setShowExistingDialog] = useState(false)

  const otherObservations = openObservations.filter((o) => o.serviceRecordId !== serviceRecordId)
  const [selectedObs, setSelectedObs] = useState<Set<string>>(() => new Set(otherObservations.map((o) => o.id)))

  const toggleObs = (id: string) => {
    setSelectedObs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Expose controls to parent via callback
  useEffect(() => {
    onControlsReady({
      onAddFinding: () => { setEditingFinding(undefined); setOpenFindingForm(true) },
      onEditFinding: (f: Finding) => { setEditingFinding(f); setOpenFindingForm(true) },
      openObservationsCount: otherObservations.length,
      onShowExistingObservations: () => setShowExistingDialog(true),
    })
  }, [otherObservations.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <FindingForm
        vehicleId={vehicleId}
        serviceRecordId={serviceRecordId}
        open={openFindingForm}
        onOpenChange={setOpenFindingForm}
        finding={editingFinding}
      />

      <Dialog open={showExistingDialog} onOpenChange={setShowExistingDialog}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{tf('vehicleHasObservations', { count: otherObservations.length })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {otherObservations.map((o) => (
              <label key={o.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={selectedObs.has(o.id)}
                  onCheckedChange={() => toggleObs(o.id)}
                  className="mt-0.5"
                />
                <span>{o.description}{o.notes ? <span className="text-muted-foreground"> — {o.notes}</span> : null}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowExistingDialog(false)}>
              {tf('dismiss')}
            </Button>
            <Button
              disabled={selectedObs.size === 0 || addingObservations}
              onClick={async () => {
                await onAddObservations(Array.from(selectedObs))
                setShowExistingDialog(false)
              }}
            >
              {addingObservations ? <span className="mr-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
              {tf('addToWorkOrder', { count: selectedObs.size })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
