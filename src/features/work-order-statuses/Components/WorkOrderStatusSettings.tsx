'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { useConfirm } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ReadOnlyBanner, ReadOnlyWrapper } from '@/app/(authenticated)/settings/read-only-guard'
import { statusMessageKeys } from '@/features/vehicles/Components/service-detail/types'
import {
  archiveWorkOrderStatus,
  createWorkOrderStatus,
  reorderWorkOrderStatuses,
  updateWorkOrderStatus,
} from '../Actions/workOrderStatusActions'
import {
  STAGES,
  STATUS_COLORS,
  STATUS_MESSAGE_TOKENS,
  type Stage,
  type StatusColor,
  type WorkOrderStatusOption,
  statusColorClasses,
} from '../Lib/stages'

type Draft = {
  id: string | null
  name: string
  stage: Stage
  color: StatusColor
  notifyCustomer: boolean
  messageTemplate: string
}

/**
 * The statuses most workshops end up wanting, one click each. The names are
 * written in the workshop's language when they are added and are theirs to
 * change afterwards; nothing in the app looks for these by name.
 */
const SUGGESTIONS: { key: string; stage: Stage; color: StatusColor; notify: boolean }[] = [
  { key: 'readyForPickup', stage: 'completed', color: 'emerald', notify: true },
  { key: 'waitingForCustomer', stage: 'in-progress', color: 'orange', notify: false },
  { key: 'waitingForApproval', stage: 'in-progress', color: 'violet', notify: true },
]

/**
 * Settings → Work order statuses. The three stages are fixed, because the rest
 * of the app reads them; what a workshop adds here are its own names for the
 * steps in between, each filed under the stage it belongs to. A status shows
 * up in that stage's menu on every work order, and one that asks for it
 * offers to tell the customer when a job reaches it.
 */
export function WorkOrderStatusSettings({ statuses }: { statuses: WorkOrderStatusOption[] }) {
  const t = useTranslations('settings.workOrderStatuses')
  const tService = useTranslations('service')
  const router = useRouter()
  const confirm = useConfirm()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const stageLabel = (stage: Stage) =>
    tService(`basicInfo.statusOptions.${statusMessageKeys[stage]}`)

  /** What is sent when the message is left empty, naming the status as it stands. */
  const suggestedMessage = (d: Draft) =>
    String(tService.raw('customStatus.defaultMessage')).replace(
      '{status}',
      d.name.trim() || t('namePlaceholder')
    )

  const blank = (stage: Stage): Draft => ({
    id: null,
    name: '',
    stage,
    color: 'blue',
    notifyCustomer: false,
    messageTemplate: '',
  })

  const save = async () => {
    if (!draft) return
    setSaving(true)
    const payload = {
      name: draft.name,
      stage: draft.stage,
      color: draft.color,
      notifyCustomer: draft.notifyCustomer,
      messageTemplate: draft.notifyCustomer ? draft.messageTemplate : '',
    }
    const result = draft.id
      ? await updateWorkOrderStatus({ id: draft.id, ...payload })
      : await createWorkOrderStatus(payload)
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || t('failed'))
      return
    }
    toast.success(t('saved'))
    setDraft(null)
    router.refresh()
  }

  const addSuggestion = async (suggestion: (typeof SUGGESTIONS)[number]) => {
    setBusyId(suggestion.key)
    const result = await createWorkOrderStatus({
      name: t(`suggestions.${suggestion.key}.name`),
      stage: suggestion.stage,
      color: suggestion.color,
      notifyCustomer: suggestion.notify,
      // Raw: the text carries {tokens} for the message, not arguments for t().
      messageTemplate: suggestion.notify
        ? String(t.raw(`suggestions.${suggestion.key}.message`))
        : '',
    })
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error || t('failed'))
      return
    }
    toast.success(t('saved'))
    router.refresh()
  }

  const remove = async (status: WorkOrderStatusOption) => {
    const ok = await confirm({
      title: t('removeTitle', { name: status.name }),
      description: t('removeBody'),
      confirmLabel: t('remove'),
      destructive: true,
    })
    if (!ok) return
    setBusyId(status.id)
    const result = await archiveWorkOrderStatus(status.id)
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error || t('failed'))
      return
    }
    router.refresh()
  }

  const move = async (stage: Stage, index: number, by: -1 | 1) => {
    const inStage = statuses.filter((s) => s.stage === stage)
    const target = index + by
    if (target < 0 || target >= inStage.length) return
    const ids = inStage.map((s) => s.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setBusyId(ids[target])
    const result = await reorderWorkOrderStatuses({ stage, ids })
    setBusyId(null)
    if (!result.success) toast.error(result.error || t('failed'))
    router.refresh()
  }

  const taken = new Set(statuses.map((s) => s.name.trim().toLowerCase()))
  const offered = SUGGESTIONS.filter(
    (s) => !taken.has(t(`suggestions.${s.key}.name`).trim().toLowerCase())
  )

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <ReadOnlyWrapper>
        <div className="space-y-6">
          {offered.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('suggestionsLabel')}
              </span>
              {offered.map((suggestion) => (
                <Button
                  key={suggestion.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void addSuggestion(suggestion)}
                  className="h-8 gap-1.5"
                >
                  {busyId === suggestion.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {t(`suggestions.${suggestion.key}.name`)}
                </Button>
              ))}
            </div>
          )}

          <AppCard icon={ListChecks} title={t('cardTitle')} contentClassName="p-0">
            <div className="divide-y divide-card-edge">
              {STAGES.map((stage, stageIndex) => {
                const inStage = statuses.filter((s) => s.stage === stage)
                return (
                  <section key={stage} className="p-5" data-testid={`status-stage-${stage}`}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary bg-primary text-[11px] font-semibold text-primary-foreground">
                          {stageIndex + 1}
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold">{stageLabel(stage)}</h3>
                          <p className="truncate text-xs text-muted-foreground">
                            {t(`stageHints.${stage}`)}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 gap-1.5"
                        onClick={() => setDraft(blank(stage))}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t('add')}
                      </Button>
                    </div>

                    <ul className="divide-y rounded-lg border">
                      {stage === 'in-progress' && (
                        // Older than this page, and part of the app: the work
                        // board has a column for it and the technician app
                        // sets it. Listed so the menu holds no surprises.
                        <li className="flex items-center gap-3 px-3 py-2.5">
                          <span
                            className={cn(
                              'h-2.5 w-2.5 shrink-0 rounded-full',
                              statusColorClasses('amber').dot
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {tService(
                              `basicInfo.statusOptions.${statusMessageKeys['waiting-parts']}`
                            )}
                          </span>
                          <Badge variant="outline" className="shrink-0 text-[11px]">
                            {t('builtIn')}
                          </Badge>
                        </li>
                      )}
                      {inStage.map((status, index) => (
                        <li
                          key={status.id}
                          className="flex items-center gap-3 px-3 py-2"
                          data-testid="status-row"
                        >
                          <span
                            className={cn(
                              'h-2.5 w-2.5 shrink-0 rounded-full',
                              statusColorClasses(status.color).dot
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {status.name}
                          </span>
                          {status.notifyCustomer && (
                            <span
                              className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex"
                              title={t('notifyHint')}
                            >
                              <BellRing className="h-3.5 w-3.5" />
                              {t('asksToNotify')}
                            </span>
                          )}
                          <div className="flex shrink-0 items-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('moveUp')}
                              title={t('moveUp')}
                              disabled={index === 0 || busyId !== null}
                              onClick={() => void move(stage, index, -1)}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('moveDown')}
                              title={t('moveDown')}
                              disabled={index === inStage.length - 1 || busyId !== null}
                              onClick={() => void move(stage, index, 1)}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('edit')}
                              title={t('edit')}
                              onClick={() =>
                                setDraft({
                                  id: status.id,
                                  name: status.name,
                                  stage: status.stage,
                                  color: (status.color as StatusColor) ?? 'slate',
                                  notifyCustomer: status.notifyCustomer,
                                  messageTemplate: status.messageTemplate ?? '',
                                })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('remove')}
                              title={t('remove')}
                              disabled={busyId !== null}
                              onClick={() => void remove(status)}
                              className="hover:text-destructive"
                            >
                              {busyId === status.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </li>
                      ))}
                      {inStage.length === 0 && stage !== 'in-progress' && (
                        <li className="px-3 py-3 text-sm text-muted-foreground">{t('empty')}</li>
                      )}
                    </ul>
                  </section>
                )
              })}
            </div>
          </AppCard>
        </div>
      </ReadOnlyWrapper>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t('editTitle') : t('addTitle')}</DialogTitle>
            <DialogDescription>{t('dialogBody')}</DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="statusName">{t('name')}</Label>
                  <Input
                    id="statusName"
                    value={draft.name}
                    maxLength={40}
                    autoFocus
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder={t('namePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="statusStage">{t('stage')}</Label>
                  <Select
                    value={draft.stage}
                    onValueChange={(value) => setDraft({ ...draft, stage: value as Stage })}
                  >
                    <SelectTrigger id="statusStage" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stageLabel(stage)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* What choosing a stage actually decides, said where it is chosen. */}
              <p className="-mt-2 text-xs text-muted-foreground">
                {t(`stageHints.${draft.stage}`)}
              </p>

              <div className="space-y-2">
                <Label>{t('color')}</Label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      aria-pressed={draft.color === color}
                      onClick={() => setDraft({ ...draft, color })}
                      className={cn(
                        'h-7 w-7 cursor-pointer rounded-full outline-none ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring',
                        statusColorClasses(color).dot,
                        draft.color === color && 'ring-2 ring-foreground'
                      )}
                    />
                  ))}
                </div>
                {draft.name.trim() && (
                  <span
                    className={cn(
                      'inline-block rounded-full border px-2 py-0.5 text-[12px] font-medium',
                      statusColorClasses(draft.color).chip
                    )}
                  >
                    {draft.name.trim()}
                  </span>
                )}
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="statusNotify">{t('notify')}</Label>
                    <p className="text-xs text-muted-foreground">{t('notifyHint')}</p>
                  </div>
                  <Switch
                    id="statusNotify"
                    checked={draft.notifyCustomer}
                    onCheckedChange={(on) => setDraft({ ...draft, notifyCustomer: on })}
                  />
                </div>
                {draft.notifyCustomer && (
                  <div className="space-y-2">
                    <Label htmlFor="statusMessage">{t('message')}</Label>
                    <Textarea
                      id="statusMessage"
                      rows={3}
                      maxLength={600}
                      value={draft.messageTemplate}
                      onChange={(e) => setDraft({ ...draft, messageTemplate: e.target.value })}
                      placeholder={suggestedMessage(draft)}
                    />
                    {/* Empty is an answer, not an omission: the suggested text
                        is sent, with whatever the status is called that day.
                        Said here, because a placeholder looks like nothing. */}
                    {draft.messageTemplate.trim() === '' && (
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{t('messageEmptyHint')}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({ ...draft, messageTemplate: suggestedMessage(draft) })
                          }
                          className="cursor-pointer font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          {t('useSuggested')}
                        </button>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{t('tokens')}</span>
                      {STATUS_MESSAGE_TOKENS.map((token) => (
                        <button
                          key={token}
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              messageTemplate: `${draft.messageTemplate}{${token}}`,
                            })
                          }
                          className="cursor-pointer rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
                        >
                          {`{${token}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button onClick={save} disabled={saving || !draft?.name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
