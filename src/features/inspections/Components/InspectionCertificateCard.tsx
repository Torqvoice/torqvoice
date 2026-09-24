'use client'

import { useId, useMemo, useState, useTransition } from 'react'
import { useDateSettings } from '@/components/date-settings-context'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateInput } from '@/components/ui/date-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileCheck2, Loader2, RotateCcw, UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { getInspectionTechnicians, updateInspectionDetails } from '../Actions/inspectionActions'
import { AddPersonDialog } from '@/features/team/Components/AddPersonDialog'
import { VEHICLE_CATEGORIES } from '../Lib/conditions'
import {
  DEFAULT_INTERVAL_MONTHS,
  TEST_INTERVALS,
  addInterval,
  dueDateInstant,
  matchInterval,
  toISODate,
} from '../Lib/testIntervals'

export interface TechnicianOption {
  id: string
  name: string
  color: string
}

/** Sentinel for the "add a technician" row, which is not a selectable value. */
const ADD_TECHNICIAN = '__add__'
const NO_TECHNICIAN = 'none'

/**
 * The certificate fields Directive 2014/45/EU Annex IV requires but that cannot
 * be derived from the checks themselves.
 *
 * Everything that can be filled in for the technician already is: the inspector
 * comes from the workshop roster, the place of test from workshop settings, and
 * the next test date from the standard interval. What is left is the handful of
 * facts only the person doing the test knows.
 */
export function InspectionCertificateCard({
  inspection,
  technicians,
  workshopAddress,
  mileageLabel,
  isCompleted,
}: {
  inspection: {
    id: string
    mileage: number | null
    vehicleCategory: string | null
    certificateNumber: string | null
    technicianId: string | null
    inspectorName: string | null
    testLocation: string | null
    nextTestDue: Date | string | null
    completedAt: Date | string | null
    createdAt: Date | string
  }
  technicians: TechnicianOption[]
  /** Workshop address from settings, used as the default place of test. */
  workshopAddress: string
  mileageLabel: string
  isCompleted: boolean
}) {
  const t = useTranslations('inspections.certificate')
  const router = useRouter()
  const fieldId = useId()
  const [isPending, startTransition] = useTransition()
  const [showAddTechnician, setShowAddTechnician] = useState(false)
  const [roster, setRoster] = useState(technicians)
  // The workshop's calendar, so the server and the browser draw the same day.
  const { timezone } = useDateSettings()

  const testDate = useMemo(
    () => new Date(inspection.completedAt ?? inspection.createdAt),
    [inspection.completedAt, inspection.createdAt]
  )

  // What is already stored, so the Save button can tell whether anything moved.
  const persisted = useMemo(
    () => ({
      mileage: inspection.mileage === null ? '' : String(inspection.mileage),
      vehicleCategory: inspection.vehicleCategory ?? NO_TECHNICIAN,
      certificateNumber: inspection.certificateNumber ?? '',
      technicianId: inspection.technicianId ?? NO_TECHNICIAN,
      testLocation: inspection.testLocation ?? '',
      nextTestDue: toISODate(inspection.nextTestDue, timezone),
    }),
    [inspection, timezone]
  )

  const [mileage, setMileage] = useState(persisted.mileage)
  const [vehicleCategory, setVehicleCategory] = useState(persisted.vehicleCategory)
  const [certificateNumber, setCertificateNumber] = useState(persisted.certificateNumber)
  const [technicianId, setTechnicianId] = useState(persisted.technicianId)
  // Blank falls back to the workshop address rather than leaving the certificate
  // without a place of test; the field stays editable for off-site work.
  const [testLocation, setTestLocation] = useState(inspection.testLocation ?? workshopAddress ?? '')
  const [nextTestDue, setNextTestDue] = useState(
    toISODate(inspection.nextTestDue, timezone) ||
      addInterval(testDate, DEFAULT_INTERVAL_MONTHS, timezone)
  )

  const isDirty =
    mileage !== persisted.mileage ||
    vehicleCategory !== persisted.vehicleCategory ||
    certificateNumber !== persisted.certificateNumber ||
    technicianId !== persisted.technicianId ||
    testLocation !== persisted.testLocation ||
    nextTestDue !== persisted.nextTestDue

  const activeInterval = matchInterval(testDate, nextTestDue, timezone)
  const locationOverridden = !!workshopAddress && testLocation !== workshopAddress

  const handleTechnicianChange = (value: string) => {
    if (value === ADD_TECHNICIAN) {
      // Let the select finish closing before the dialog opens, otherwise the
      // select's dismiss layer pulls focus back as the dialog mounts and the
      // name field never gets it.
      setTimeout(() => setShowAddTechnician(true), 0)
      return
    }
    setTechnicianId(value)
    commit({ technicianId: value === NO_TECHNICIAN ? null : value })
  }

  /**
   * Each field saves itself as it is left: the odometer on blur, a select or
   * a date as soon as it is picked. Before this the fields waited for the
   * Save button, and a reload in between threw them away. Only what changed
   * is sent, so two fields edited in quick succession never overwrite each
   * other with a stale value. The page is refreshed after, which also moves
   * the "unsaved" marker off.
   */
  const [autosaving, setAutosaving] = useState(0)
  const [autosavedAt, setAutosavedAt] = useState<Date | null>(null)
  const commit = (
    patch: Partial<{
      mileage: number | null
      vehicleCategory: string | null
      certificateNumber: string | null
      technicianId: string | null
      testLocation: string | null
      nextTestDue: Date | null
    }>
  ) => {
    if (isCompleted) return
    setAutosaving((n) => n + 1)
    updateInspectionDetails(inspection.id, patch)
      .then((result) => {
        if (result.success) {
          setAutosavedAt(new Date())
          router.refresh()
        } else {
          toast.error(result.error || t('saveFailed'))
        }
      })
      .finally(() => setAutosaving((n) => n - 1))
  }
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateInspectionDetails(inspection.id, {
        mileage: mileage === '' ? null : Number(mileage),
        vehicleCategory: vehicleCategory === NO_TECHNICIAN ? null : vehicleCategory,
        certificateNumber: certificateNumber || null,
        technicianId: technicianId === NO_TECHNICIAN ? null : technicianId,
        testLocation: testLocation || null,
        nextTestDue: nextTestDue ? dueDateInstant(nextTestDue, timezone) : null,
      })
      if (result.success) {
        toast.success(t('saved'))
        router.refresh()
      } else {
        toast.error(result.error || t('saveFailed'))
      }
    })
  }

  return (
    <section aria-labelledby={`${fieldId}-heading`} className="bg-card rounded-lg border">
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <FileCheck2 className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <h2 id={`${fieldId}-heading`} className="text-sm font-semibold">
            {t('title')}
          </h2>
          <p className="text-muted-foreground text-xs">{t('description')}</p>
        </div>
      </header>

      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-inspector`}>{t('inspector')}</Label>
          <Select
            value={technicianId}
            onValueChange={handleTechnicianChange}
            disabled={isCompleted}
          >
            <SelectTrigger id={`${fieldId}-inspector`}>
              <SelectValue placeholder={t('notRecorded')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TECHNICIAN}>{t('notRecorded')}</SelectItem>
              {roster.map((tech) => (
                <SelectItem key={tech.id} value={tech.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tech.color }}
                      aria-hidden="true"
                    />
                    {tech.name}
                  </span>
                </SelectItem>
              ))}
              {!isCompleted && (
                <>
                  <SelectSeparator />
                  <SelectItem value={ADD_TECHNICIAN}>
                    <span className="flex items-center gap-2">
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('addTechnician')}
                    </span>
                  </SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
          {/* An inspection carried out before the roster existed still has a
              name on it; say so rather than showing an empty field. */}
          {technicianId === NO_TECHNICIAN && inspection.inspectorName && (
            <p className="text-muted-foreground text-xs">
              {t('recordedAs', { name: inspection.inspectorName })}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-category`}>{t('vehicleCategory')}</Label>
          <Select
            value={vehicleCategory}
            onValueChange={(value) => {
              setVehicleCategory(value)
              commit({ vehicleCategory: value === NO_TECHNICIAN ? null : value })
            }}
            disabled={isCompleted}
          >
            <SelectTrigger id={`${fieldId}-category`}>
              <SelectValue placeholder={t('notRecorded')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TECHNICIAN}>{t('notRecorded')}</SelectItem>
              {VEHICLE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-mileage`}>
            {t('mileageAtTest', { label: mileageLabel })}
          </Label>
          <Input
            id={`${fieldId}-mileage`}
            inputMode="numeric"
            value={mileage}
            onChange={(e) => /^\d*$/.test(e.target.value) && setMileage(e.target.value)}
            onBlur={() => {
              if (mileage !== persisted.mileage)
                commit({ mileage: mileage === '' ? null : Number(mileage) })
            }}
            onKeyDown={blurOnEnter}
            disabled={isCompleted}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-certificate`}>{t('reportReference')}</Label>
          <Input
            id={`${fieldId}-certificate`}
            value={certificateNumber}
            onChange={(e) => setCertificateNumber(e.target.value)}
            onBlur={() => {
              if (certificateNumber !== persisted.certificateNumber) {
                commit({ certificateNumber: certificateNumber || null })
              }
            }}
            onKeyDown={blurOnEnter}
            placeholder={t('optional')}
            disabled={isCompleted}
          />
          {!isCompleted && (
            <p className="text-muted-foreground text-xs">{t('reportReferenceHelp')}</p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${fieldId}-location`}>{t('placeOfTest')}</Label>
          <Input
            id={`${fieldId}-location`}
            value={testLocation}
            onChange={(e) => setTestLocation(e.target.value)}
            onBlur={() => {
              if (testLocation !== persisted.testLocation)
                commit({ testLocation: testLocation || null })
            }}
            onKeyDown={blurOnEnter}
            placeholder={workshopAddress || t('placeholderAddress')}
            disabled={isCompleted}
          />
          {!isCompleted && (
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
              {locationOverridden ? (
                <>
                  <span>{t('differsFromWorkshop')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTestLocation(workshopAddress)
                      commit({ testLocation: workshopAddress || null })
                    }}
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    {t('useWorkshopAddress')}
                  </button>
                </>
              ) : workshopAddress ? (
                <>
                  <span>{t('fromSettings')}</span>
                  <Link href="/settings/workshop" className="text-primary hover:underline">
                    {t('change')}
                  </Link>
                </>
              ) : (
                <>
                  <span>{t('noWorkshopAddress')}</span>
                  <Link href="/settings/workshop" className="text-primary hover:underline">
                    {t('addOne')}
                  </Link>
                </>
              )}
            </p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${fieldId}-next`}>{t('nextTestDue')}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1">
              <DateInput
                id={`${fieldId}-next`}
                value={nextTestDue}
                onChange={(value) => {
                  setNextTestDue(value)
                  commit({ nextTestDue: value ? dueDateInstant(value, timezone) : null })
                }}
                placeholder={t('notSet')}
              />
            </div>
            {!isCompleted && (
              <div role="group" aria-label={t('intervalGroup')} className="flex flex-wrap gap-1">
                {TEST_INTERVALS.map((interval) => {
                  const selected = activeInterval?.months === interval.months
                  return (
                    <button
                      key={interval.months}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        const value = addInterval(testDate, interval.months, timezone)
                        setNextTestDue(value)
                        commit({ nextTestDue: dueDateInstant(value, timezone) })
                      }}
                      className={`focus-visible:ring-ring rounded-full border px-2.5 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                        selected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted'
                      }`}
                    >
                      {t(interval.key)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {!isCompleted && <p className="text-muted-foreground text-xs">{t('intervalHelp')}</p>}
        </div>
      </div>

      {!isCompleted && (
        <div className="flex min-h-11 items-center justify-end gap-3 border-t px-4 py-2">
          <p className="text-muted-foreground text-xs" role="status">
            {autosaving > 0
              ? t('saving')
              : isDirty
                ? t('unsaved')
                : autosavedAt
                  ? t('savedAt', {
                      time: autosavedAt.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })
                  : t('savesAsYouGo')}
          </p>
          {/* Only for an edit a field's own save refused: everything else has gone already. */}
          {isDirty && autosaving === 0 && (
            <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('saveDetails')}
            </Button>
          )}
        </div>
      )}

      {/* The same dialog as Settings → Team: a roster name, a technician with
          an app login, or an office member with a role. Whoever is added is
          picked as the inspector, since that is why the dialog was opened. */}
      <AddPersonDialog
        open={showAddTechnician}
        onOpenChange={setShowAddTechnician}
        onChanged={() => {
          const known = new Set(roster.map((technician) => technician.id))
          getInspectionTechnicians().then((result) => {
            if (!result.success || !result.data) return
            setRoster(result.data)
            const added = result.data.find((technician) => !known.has(technician.id))
            if (added) setTechnicianId(added.id)
          })
        }}
      />
    </section>
  )
}
