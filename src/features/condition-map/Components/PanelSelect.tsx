'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VIEWS } from '../Lib/drawingTypes'
import { type PanelSpot, spotKey } from '../Lib/panelSpots'

/**
 * The panels a mark can be put on, by name, grouped by the view they are
 * drawn in: the way to place or move a mark without a pointer.
 */
export function PanelSelect({
  id,
  spots,
  value,
  disabled = false,
  onChange,
}: {
  id: string
  spots: readonly PanelSpot[]
  /** The chosen spot's key (`view:panel`), or empty for none yet. */
  value: string
  disabled?: boolean
  onChange: (spot: PanelSpot) => void
}) {
  const t = useTranslations('conditionMap')
  // By name within each view, so typing a panel's first letters finds it.
  const groups = useMemo(
    () =>
      VIEWS.map((view) => ({
        view,
        spots: spots
          .filter((spot) => spot.view === view)
          .map((spot) => ({ spot, label: t(`panels.${spot.panel}`) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      })).filter((group) => group.spots.length > 0),
    [spots, t]
  )
  const single = groups.length === 1
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const spot = spots.find((s) => spotKey(s) === next)
        if (spot) onChange(spot)
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={t('choosePanel')} />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.view}>
            {!single && <SelectLabel>{t(`views.${group.view}`)}</SelectLabel>}
            {group.spots.map(({ spot, label }) => (
              <SelectItem key={spotKey(spot)} value={spotKey(spot)}>
                {single
                  ? label
                  : t('panelInView', { panel: label, view: t(`views.${group.view}`) })}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
