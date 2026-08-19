'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2 } from 'lucide-react'
import { createLocation, createLocationsBulk, updateLocation } from '../Actions/storageActions'
import { buildLocationCode } from '../Lib/tireConstants'

export type EditableLocation = {
  id: string
  code: string
  zone: string | null
  rack: string | null
  shelf: string | null
  position: string | null
  capacity: number
  notes?: string | null
}

/**
 * Creating storage. Two ways in, because filling a warehouse one shelf at a
 * time is the slowest part of adopting the module: a single location for
 * odd corners, and a numbered run for a rack, which is how shelves almost
 * always come.
 */
export function LocationFormDialog({
  open,
  onOpenChange,
  warehouseId,
  warehouseName,
  location,
  defaultCapacity,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseId: string
  warehouseName: string
  location?: EditableLocation
  defaultCapacity: number
}) {
  const router = useRouter()
  const t = useTranslations('tireHotel')
  const [saving, setSaving] = useState(false)

  const [zone, setZone] = useState('')
  const [rack, setRack] = useState('')
  const [shelf, setShelf] = useState('')
  const [position, setPosition] = useState('')
  const [code, setCode] = useState('')
  const [capacity, setCapacity] = useState(String(defaultCapacity))
  const [notes, setNotes] = useState('')

  const [bulkZone, setBulkZone] = useState('')
  const [bulkRack, setBulkRack] = useState('')
  const [shelfFrom, setShelfFrom] = useState('1')
  const [shelfTo, setShelfTo] = useState('6')
  const [bulkCapacity, setBulkCapacity] = useState(String(defaultCapacity))

  const isEdit = !!location

  useEffect(() => {
    if (!open) return
    setZone(location?.zone ?? '')
    setRack(location?.rack ?? '')
    setShelf(location?.shelf ?? '')
    setPosition(location?.position ?? '')
    setCode(location?.code ?? '')
    setCapacity(String(location?.capacity ?? defaultCapacity))
    setNotes(location?.notes ?? '')
    setBulkZone('')
    setBulkRack('')
    setShelfFrom('1')
    setShelfTo('6')
    setBulkCapacity(String(defaultCapacity))
  }, [open, location, defaultCapacity])

  // The code writes itself from whichever parts are filled in, but stays
  // editable: some workshops have shelf names that no hierarchy produces.
  const derivedCode = buildLocationCode({ zone, rack, shelf, position })
  const effectiveCode = code.trim() || derivedCode

  const handleSaveSingle = async () => {
    setSaving(true)
    const payload = {
      warehouseId,
      code: code.trim(),
      zone,
      rack,
      shelf,
      position,
      capacity: Number(capacity) || 0,
      notes,
    }
    const result = isEdit
      ? await updateLocation({ id: location.id, ...payload })
      : await createLocation(payload)
    setSaving(false)

    if (!result.success) {
      toast.error(result.error ?? t('storage.saveFailed'))
      return
    }
    toast.success(isEdit ? t('storage.locationUpdated') : t('storage.locationCreated'))
    onOpenChange(false)
    router.refresh()
  }

  const handleSaveBulk = async () => {
    setSaving(true)
    const result = await createLocationsBulk({
      warehouseId,
      zone: bulkZone,
      rack: bulkRack,
      shelfFrom: Number(shelfFrom) || 0,
      shelfTo: Number(shelfTo) || 0,
      capacity: Number(bulkCapacity) || 0,
    })
    setSaving(false)

    if (!result.success) {
      toast.error(result.error ?? t('storage.saveFailed'))
      return
    }
    const { created, skipped } = result.data ?? { created: 0, skipped: [] }
    if (created === 0) {
      toast.error(t('storage.bulkNothingCreated'))
      return
    }
    toast.success(
      skipped.length > 0
        ? t('storage.bulkCreatedWithSkips', { created, skipped: skipped.length })
        : t('storage.bulkCreated', { count: created })
    )
    onOpenChange(false)
    router.refresh()
  }

  const bulkPreview = (() => {
    const from = Number(shelfFrom)
    const to = Number(shelfTo)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null
    const count = to - from + 1
    const first = buildLocationCode({ zone: bulkZone, rack: bulkRack, shelf: String(from) })
    const last = buildLocationCode({ zone: bulkZone, rack: bulkRack, shelf: String(to) })
    if (!first) return null
    return { count, first, last, tires: count * (Number(bulkCapacity) || 0) }
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('storage.editLocation') : t('storage.addLocation')}</DialogTitle>
          <DialogDescription>
            {t('storage.locationDialogDescription', { warehouse: warehouseName })}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <SingleFields
            {...{
              zone,
              setZone,
              rack,
              setRack,
              shelf,
              setShelf,
              position,
              setPosition,
              code,
              setCode,
              capacity,
              setCapacity,
              notes,
              setNotes,
              effectiveCode,
            }}
          />
        ) : (
          <Tabs defaultValue="bulk">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="bulk">{t('storage.tabBulk')}</TabsTrigger>
              <TabsTrigger value="single">{t('storage.tabSingle')}</TabsTrigger>
            </TabsList>

            <TabsContent value="bulk" className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bulkZone">{t('storage.zone')}</Label>
                  <Input
                    id="bulkZone"
                    value={bulkZone}
                    onChange={(e) => setBulkZone(e.target.value)}
                    placeholder={t('storage.zonePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulkRack">{t('storage.rack')}</Label>
                  <Input
                    id="bulkRack"
                    value={bulkRack}
                    onChange={(e) => setBulkRack(e.target.value)}
                    placeholder={t('storage.rackPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="shelfFrom">{t('storage.shelfFrom')}</Label>
                  <Input
                    id="shelfFrom"
                    type="number"
                    min="0"
                    value={shelfFrom}
                    onChange={(e) => setShelfFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shelfTo">{t('storage.shelfTo')}</Label>
                  <Input
                    id="shelfTo"
                    type="number"
                    min="0"
                    value={shelfTo}
                    onChange={(e) => setShelfTo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulkCapacity">{t('storage.capacity')}</Label>
                  <Input
                    id="bulkCapacity"
                    type="number"
                    min="0"
                    value={bulkCapacity}
                    onChange={(e) => setBulkCapacity(e.target.value)}
                  />
                </div>
              </div>

              {bulkPreview && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">
                    {t('storage.bulkPreview', {
                      count: bulkPreview.count,
                      first: bulkPreview.first,
                      last: bulkPreview.last,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('storage.bulkPreviewCapacity', { tires: bulkPreview.tires })}
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleSaveBulk} disabled={saving || !bulkPreview}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('storage.createShelves')}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="single" className="space-y-4 pt-4">
              <SingleFields
                {...{
                  zone,
                  setZone,
                  rack,
                  setRack,
                  shelf,
                  setShelf,
                  position,
                  setPosition,
                  code,
                  setCode,
                  capacity,
                  setCapacity,
                  notes,
                  setNotes,
                  effectiveCode,
                }}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleSaveSingle} disabled={saving || !effectiveCode}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('storage.createLocation')}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        )}

        {isEdit && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveSingle} disabled={saving || !effectiveCode}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SingleFields({
  zone,
  setZone,
  rack,
  setRack,
  shelf,
  setShelf,
  position,
  setPosition,
  code,
  setCode,
  capacity,
  setCapacity,
  notes,
  setNotes,
  effectiveCode,
}: {
  zone: string
  setZone: (v: string) => void
  rack: string
  setRack: (v: string) => void
  shelf: string
  setShelf: (v: string) => void
  position: string
  setPosition: (v: string) => void
  code: string
  setCode: (v: string) => void
  capacity: string
  setCapacity: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  effectiveCode: string
}) {
  const t = useTranslations('tireHotel')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="zone">{t('storage.zone')}</Label>
          <Input
            id="zone"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder={t('storage.zonePlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rack">{t('storage.rack')}</Label>
          <Input
            id="rack"
            value={rack}
            onChange={(e) => setRack(e.target.value)}
            placeholder={t('storage.rackPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shelf">{t('storage.shelf')}</Label>
          <Input
            id="shelf"
            value={shelf}
            onChange={(e) => setShelf(e.target.value)}
            placeholder={t('storage.shelfPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="position">{t('storage.position')}</Label>
          <Input
            id="position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder={t('storage.positionPlaceholder')}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="code">{t('storage.code')}</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={effectiveCode || t('storage.codePlaceholder')}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">{t('storage.codeHint')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="capacity">{t('storage.capacity')}</Label>
          <Input
            id="capacity"
            type="number"
            min="0"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('storage.capacityHint')}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="locationNotes">{t('storage.notes')}</Label>
        <Textarea
          id="locationNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
    </div>
  )
}
