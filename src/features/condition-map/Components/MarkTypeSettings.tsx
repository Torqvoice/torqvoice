'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
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
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { ReadOnlyBanner, ReadOnlyWrapper } from '@/app/(authenticated)/settings/read-only-guard'
import {
  createMarkType,
  removeMarkType,
  reorderMarkTypes,
  updateMarkType,
} from '../Actions/markTypeActions'
import { MARK_COLORS, MARK_SHAPES, type MarkShape, type MarkType } from '../Lib/markTypes'
import { MarkIcon } from './ConditionMap'

/**
 * The workshop's kinds of mark on the condition map: the built-in eight,
 * renamed, recoloured or hidden as the workshop likes, and its own kinds
 * beside them. Each is a shape and a colour, so two kinds tell apart on a
 * black-and-white print as well as on screen.
 */

interface Draft {
  key: string | null
  name: string
  shape: MarkShape
  color: string
  hidden: boolean
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function MarkTypeSettings({ types }: { types: MarkType[] }) {
  const t = useTranslations('settings.markTypes')
  const router = useRouter()
  const confirm = useConfirm()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const blank = (): Draft => ({
    key: null,
    name: '',
    shape: 'circle',
    color: MARK_COLORS[0],
    hidden: false,
  })

  const save = async () => {
    if (!draft) return
    if (!HEX.test(draft.color)) {
      toast.error(t('colorInvalid'))
      return
    }
    setSaving(true)
    const payload = {
      name: draft.name,
      shape: draft.shape,
      color: draft.color,
      hidden: draft.hidden,
    }
    const result = draft.key
      ? await updateMarkType({ key: draft.key, ...payload })
      : await createMarkType(payload)
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || t('failed'))
      return
    }
    toast.success(t('saved'))
    setDraft(null)
    router.refresh()
  }

  const setHidden = async (type: MarkType, hidden: boolean) => {
    setBusyKey(type.key)
    const result = await updateMarkType({
      key: type.key,
      name: type.name,
      shape: type.shape,
      color: type.color,
      hidden,
    })
    setBusyKey(null)
    if (!result.success) toast.error(result.error || t('failed'))
    router.refresh()
  }

  const remove = async (type: MarkType) => {
    const ok = await confirm({
      title: type.builtin
        ? t('restoreTitle', { name: type.name })
        : t('removeTitle', { name: type.name }),
      description: type.builtin ? t('restoreBody') : t('removeBody'),
      confirmLabel: type.builtin ? t('restore') : t('remove'),
      destructive: !type.builtin,
    })
    if (!ok) return
    setBusyKey(type.key)
    const result = await removeMarkType(type.key)
    setBusyKey(null)
    if (!result.success) {
      toast.error(result.error || t('failed'))
      return
    }
    router.refresh()
  }

  const move = async (index: number, by: -1 | 1) => {
    const target = index + by
    if (target < 0 || target >= types.length) return
    const keys = types.map((type) => type.key)
    ;[keys[index], keys[target]] = [keys[target], keys[index]]
    setBusyKey(keys[target])
    const result = await reorderMarkTypes({ keys })
    setBusyKey(null)
    if (!result.success) toast.error(result.error || t('failed'))
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{t('title')}</h3>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <ReadOnlyWrapper>
          <Button type="button" size="sm" onClick={() => setDraft(blank())} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t('add')}
          </Button>
        </ReadOnlyWrapper>
      </div>

      <ReadOnlyWrapper>
        <AppCard title={t('cardTitle')} contentClassName="p-0">
          <ul className="divide-y divide-card-edge" data-testid="mark-type-list">
            {types.map((type, index) => (
              <li
                key={type.key}
                className={cn('flex items-center gap-3 px-4 py-2.5', type.hidden && 'opacity-60')}
                data-testid="mark-type-row"
              >
                <MarkIcon type={type} severity="minor" size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{type.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`shapes.${type.shape}`)}
                    {type.builtin && !type.changed ? ` · ${t('builtin')}` : ''}
                  </span>
                </span>
                {type.hidden && (
                  <Badge variant="outline" className="hidden sm:inline-flex">
                    {t('hiddenBadge')}
                  </Badge>
                )}
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('moveUp')}
                    title={t('moveUp')}
                    disabled={index === 0 || busyKey !== null}
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('moveDown')}
                    title={t('moveDown')}
                    disabled={index === types.length - 1 || busyKey !== null}
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={type.hidden ? t('show') : t('hide')}
                    title={type.hidden ? t('show') : t('hide')}
                    disabled={busyKey !== null}
                    onClick={() => void setHidden(type, !type.hidden)}
                  >
                    {type.hidden ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('edit')}
                    title={t('edit')}
                    disabled={busyKey !== null}
                    onClick={() =>
                      setDraft({
                        key: type.key,
                        name: type.name,
                        shape: type.shape,
                        color: type.color,
                        hidden: type.hidden,
                      })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {(type.changed || !type.builtin) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={type.builtin ? t('restore') : t('remove')}
                      title={type.builtin ? t('restore') : t('remove')}
                      disabled={busyKey !== null}
                      onClick={() => void remove(type)}
                    >
                      {busyKey === type.key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : type.builtin ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </AppCard>
      </ReadOnlyWrapper>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.key ? t('editTitle') : t('addTitle')}</DialogTitle>
            <DialogDescription>{t('dialogBody')}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
                <MarkIcon
                  type={{
                    shape: draft.shape,
                    color: HEX.test(draft.color) ? draft.color : '#6b7280',
                  }}
                  severity="minor"
                  size={28}
                />
                <MarkIcon
                  type={{
                    shape: draft.shape,
                    color: HEX.test(draft.color) ? draft.color : '#6b7280',
                  }}
                  severity="major"
                  size={28}
                />
                <span className="text-xs text-muted-foreground">{t('previewHint')}</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mark-type-name">{t('name')}</Label>
                <Input
                  id="mark-type-name"
                  value={draft.name}
                  maxLength={40}
                  placeholder={t('namePlaceholder')}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">{t('shape')}</legend>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {MARK_SHAPES.map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      aria-pressed={draft.shape === shape}
                      title={t(`shapes.${shape}`)}
                      onClick={() => setDraft({ ...draft, shape })}
                      className={cn(
                        'flex h-11 items-center justify-center rounded-md border transition-colors',
                        draft.shape === shape
                          ? 'border-primary bg-primary/10'
                          : 'border-input bg-background hover:bg-muted'
                      )}
                    >
                      <MarkIcon
                        type={{ shape, color: HEX.test(draft.color) ? draft.color : '#6b7280' }}
                        severity="minor"
                        size={20}
                      />
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">{t('color')}</legend>
                <div className="flex flex-wrap items-center gap-1.5">
                  {MARK_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      aria-pressed={draft.color.toLowerCase() === color}
                      onClick={() => setDraft({ ...draft, color })}
                      className={cn(
                        'h-7 w-7 rounded-full border-2 transition-transform',
                        draft.color.toLowerCase() === color
                          ? 'scale-110 border-foreground'
                          : 'border-transparent'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <Input
                    aria-label={t('customColor')}
                    value={draft.color}
                    maxLength={7}
                    onChange={(e) => setDraft({ ...draft, color: e.target.value.trim() })}
                    className="h-8 w-24 font-mono text-xs"
                  />
                </div>
              </fieldset>
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{t('hidden')}</div>
                  <div className="text-xs text-muted-foreground">{t('hiddenHint')}</div>
                </div>
                <Switch
                  checked={draft.hidden}
                  onCheckedChange={(hidden) => setDraft({ ...draft, hidden })}
                  aria-label={t('hidden')}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving || !draft?.name.trim()}
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
