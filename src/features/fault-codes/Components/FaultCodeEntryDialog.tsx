'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { addFaultCodeFindings } from '../Actions/addFaultCodeFindings'
import { lookupFaultCodes } from '../Actions/lookupFaultCodes'
import { extractFaultCodes, isManufacturerCode } from '../Lib/codes'
import type { FaultCodeView } from '../Lib/types'
import { FaultCodeChip, FaultStatusBadge, MeaningSourceLabel, MeaningText } from './FaultCodeChip'

/** Wait this long after the last keystroke before asking for meanings. */
const LOOKUP_DEBOUNCE_MS = 250

function unavailable(code: string): FaultCodeView {
  return {
    code,
    state: 'unavailable',
    range: isManufacturerCode(code) ? 'manufacturer' : 'standard',
    title: null,
    source: null,
    make: null,
    lang: null,
    machineTranslated: false,
    verified: false,
    version: null,
    flags: null,
  }
}

/**
 * "Add fault codes" on a work order: a box that turns whatever is typed or
 * pasted ("p0420, P0171 stored") into code chips as it goes, each with its
 * meaning on this vehicle as soon as it arrives, and adds them to the job's
 * findings in one go. The codes are there the moment they are typed; a
 * meaning that does not come says so and the code is added all the same.
 */
export function FaultCodeEntryDialog({
  open,
  onOpenChange,
  serviceRecordId,
  vehicleId,
  concerns = [],
  oemSource = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceRecordId: string
  vehicleId: string
  concerns?: { id: string; description: string }[]
  /** The car has manufacturer code data ("bmw"), so BMW codes are read too. */
  oemSource?: string | null
}) {
  const t = useTranslations('faultCodes.entry')
  const router = useRouter()
  const [text, setText] = useState('')
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [views, setViews] = useState<Record<string, FaultCodeView>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())
  // 'none' rather than '' because Radix treats an empty value as unset.
  const [concernId, setConcernId] = useState('none')
  const [saving, setSaving] = useState(false)
  const asked = useRef(new Set<string>())

  useEffect(() => {
    if (open) return
    setText('')
    setRemoved(new Set())
    setConcernId('none')
  }, [open])

  const found = useMemo(
    () => extractFaultCodes(text, { oem: oemSource !== null }),
    [text, oemSource]
  )
  const codes = found.filter((c) => !removed.has(c.code))

  // Ask once per code, for the codes not asked about yet.
  useEffect(() => {
    const fresh = found.map((c) => c.code).filter((code) => !asked.current.has(code))
    if (fresh.length === 0) return
    const timer = setTimeout(() => {
      for (const code of fresh) asked.current.add(code)
      setPending((prev) => new Set([...prev, ...fresh]))
      lookupFaultCodes({ codes: fresh, vehicleId, language: 'document' }).then((result) => {
        setPending((prev) => {
          const next = new Set(prev)
          for (const code of fresh) next.delete(code)
          return next
        })
        if (!result.success || !result.data) {
          // Shown as not available, and asked again on the next keystroke.
          for (const code of fresh) asked.current.delete(code)
          setViews((prev) => {
            const next = { ...prev }
            for (const code of fresh) next[code] = unavailable(code)
            return next
          })
          return
        }
        const answered = result.data.results
        setViews((prev) => {
          const next = { ...prev }
          for (const view of answered) next[view.code] = view
          return next
        })
        // A code the service did not answer for is asked again on the next keystroke.
        if (!result.data.available) {
          for (const view of answered) {
            if (view.state === 'unavailable') asked.current.delete(view.code)
          }
        }
      })
    }, LOOKUP_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [found, vehicleId])

  const add = async () => {
    if (codes.length === 0) return
    setSaving(true)
    const result = await addFaultCodeFindings({
      serviceRecordId,
      codes: codes.map((c) => ({ code: c.code, status: c.status ?? null })),
      concernId: concernId === 'none' ? null : concernId,
    })
    setSaving(false)
    if (!result.success || !result.data) {
      toast.error(result.error || t('failed'))
      return
    }
    const { added, skipped } = result.data
    if (added > 0) toast.success(t('added', { count: added }))
    if (skipped > 0) toast.info(t('skipped', { count: skipped }))
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t(oemSource ? 'descriptionOem' : 'description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fault-code-entry" className="sr-only">
              {t('title')}
            </Label>
            <Textarea
              id="fault-code-entry"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t(oemSource ? 'placeholderOem' : 'placeholder')}
              rows={3}
              className="font-mono"
              spellCheck={false}
              autoCapitalize="characters"
            />
          </div>

          {codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <ul className="space-y-1.5" aria-label={t('found')}>
              {codes.map((c) => {
                const view = views[c.code]
                return (
                  <li
                    key={c.code}
                    className="flex items-start gap-2 rounded-md border px-2.5 py-2"
                    data-testid="fault-code-row"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <FaultCodeChip code={c.code} />
                        <FaultStatusBadge status={c.status} />
                        {view?.state === 'found' && (
                          <MeaningSourceLabel
                            source={view.source}
                            make={view.make}
                            machineTranslated={view.machineTranslated}
                          />
                        )}
                      </div>
                      <MeaningText
                        view={view}
                        loading={pending.has(c.code) || !view}
                        className="block"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('remove', { code: c.code })}
                      onClick={() => setRemoved((prev) => new Set([...prev, c.code]))}
                    >
                      <X />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          {concerns.length > 0 && (
            <div className="min-w-0 space-y-2">
              <Label htmlFor="fault-code-concern">{t('concern')}</Label>
              <Select value={concernId} onValueChange={setConcernId}>
                <SelectTrigger
                  id="fault-code-concern"
                  className="w-full min-w-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[min(28rem,calc(100vw-4rem))]">
                  <SelectItem value="none">{t('concernNone')}</SelectItem>
                  {concerns.map((concern) => (
                    <SelectItem key={concern.id} value={concern.id} className="whitespace-normal">
                      {concern.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="button" disabled={codes.length === 0 || saving} onClick={add}>
            {saving && <Loader2 className="animate-spin" />}
            {t('add', { count: codes.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
