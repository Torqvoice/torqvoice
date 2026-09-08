'use client'

import { FileText, KeyRound, Loader2, MessageSquare, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { useConfirm } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  applyEmailTemplate,
  deleteEmailTemplate,
} from '@/features/email/Actions/emailTemplateActions'
import { type EmailSampleData, EmailThumbnail } from '@/features/email/Components/EmailThumbnail'
import {
  EMAIL_KIND_GROUPS,
  type EmailKind,
  type EmailKindGroup,
  kindsInGroup,
} from '@/features/email/Lib/emailKinds'
import type { EmailTemplate, SavedEmailTemplate } from '@/features/email/Lib/emailTemplate'
import { cn } from '@/lib/utils'

const GROUP_ICONS: Record<EmailKindGroup, typeof FileText> = {
  documents: FileText,
  messages: MessageSquare,
  portal: KeyRound,
}

/**
 * One section per group of mails, one row per kind, and a card for every
 * template the kind can send with: the built-in preset first, then whatever
 * the workshop has saved. The card in use wears the pill; the others offer
 * to take over. Clicking a card opens the designer on it in a new tab, the
 * way the document designer opens from the templates page.
 */
export function EmailTemplateGallery({
  presets,
  samples,
  saved,
  active,
}: {
  presets: Record<EmailKind, EmailTemplate>
  samples: Record<EmailKind, EmailSampleData>
  saved: SavedEmailTemplate[]
  active: Record<EmailKind, string | null>
}) {
  const t = useTranslations('settings.emailTemplates')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {EMAIL_KIND_GROUPS.map((group) => (
        <AppCard
          key={group}
          icon={GROUP_ICONS[group]}
          title={t(`groups.${group}`)}
          contentClassName="space-y-6"
        >
          {kindsInGroup(group).map((kind) => (
            <KindRow
              key={kind}
              kind={kind}
              preset={presets[kind]}
              sample={samples[kind]}
              saved={saved.filter((template) => template.kind === kind)}
              activeId={active[kind]}
            />
          ))}
        </AppCard>
      ))}
    </div>
  )
}

function KindRow({
  kind,
  preset,
  sample,
  saved,
  activeId,
}: {
  kind: EmailKind
  preset: EmailTemplate
  sample: EmailSampleData
  saved: SavedEmailTemplate[]
  activeId: string | null
}) {
  const t = useTranslations('settings.emailTemplates')
  const format = useFormatter()
  const router = useRouter()
  const confirm = useConfirm()
  // The card whose request is out, then the card whose answer the page is
  // still catching up with: a card stays dimmed from the click until the
  // refreshed props have arrived, so nothing on it can be pressed twice.
  const [busy, setBusy] = useState<string | null>(null)
  const [settling, setSettling] = useState<string | null>(null)
  const [refreshing, startRefresh] = useTransition()
  // Deleted rows leave the grid at once rather than when the refresh lands.
  const [removed, setRemoved] = useState<string[]>([])

  useEffect(() => {
    if (!refreshing) setSettling(null)
  }, [refreshing])

  const shown = saved.filter((template) => !removed.includes(template.id))
  const working = (key: string) => busy === key || (refreshing && settling === key)

  // A saved id that no longer matches a row sends with the preset, which is
  // what the resolver does too; the preset card says so.
  const presetInUse = activeId === null || !shown.some((template) => template.id === activeId)

  const refresh = (key: string) => {
    setSettling(key)
    startRefresh(() => router.refresh())
  }

  const apply = async (id: string | null, name: string) => {
    const key = id ?? 'preset'
    setBusy(key)
    try {
      const result = await applyEmailTemplate(kind, id)
      if (!result.success) throw new Error(result.error)
      toast.success(t('defaultSet', { name }))
      refresh(key)
    } catch {
      toast.error(t('couldNotSetDefault'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (template: SavedEmailTemplate) => {
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteConfirm', { name: template.name }),
      confirmLabel: t('delete'),
      destructive: true,
    })
    if (!ok) return
    setBusy(template.id)
    try {
      const result = await deleteEmailTemplate(template.id)
      if (!result.success) throw new Error(result.error)
      toast.success(t('deleted', { name: template.name }))
      setRemoved((prev) => [...prev, template.id])
      refresh(template.id)
    } catch {
      toast.error(t('couldNotDelete'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section>
      <h3 className="text-sm font-medium">{t(`kinds.${kind}.name`)}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{t(`kinds.${kind}.description`)}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <TemplateCard
          href={`/email-designer?kind=${kind}&preset=1`}
          template={preset}
          sample={sample}
          name={t('builtIn')}
          meta={preset.name}
          inUse={presetInUse}
          pending={working('preset')}
          action={
            !presetInUse && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                disabled={working('preset')}
                onClick={() => void apply(null, t('builtIn'))}
              >
                {working('preset') && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {t('useBuiltIn')}
              </Button>
            )
          }
        />

        {shown.map((template) => {
          const inUse = activeId === template.id
          const pending = working(template.id)
          return (
            <TemplateCard
              key={template.id}
              href={`/email-designer?kind=${kind}&template=${template.id}`}
              template={template}
              sample={sample}
              name={template.name}
              meta={t('updatedOn', {
                date: format.dateTime(new Date(template.updatedAt), { dateStyle: 'medium' }),
              })}
              inUse={inUse}
              pending={pending}
              onDelete={() => void remove(template)}
              action={
                !inUse && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    disabled={pending}
                    onClick={() => void apply(template.id, template.name)}
                  >
                    {pending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    {t('setDefault')}
                  </Button>
                )
              }
            />
          )
        })}
      </div>
    </section>
  )
}

function TemplateCard({
  href,
  template,
  sample,
  name,
  meta,
  inUse,
  pending = false,
  action,
  onDelete,
}: {
  href: string
  template: EmailTemplate
  sample: EmailSampleData
  name: string
  meta: string
  inUse: boolean
  /** A request about this card is out, or the page has not caught up with its answer yet. */
  pending?: boolean
  action?: React.ReactNode
  onDelete?: () => void
}) {
  const t = useTranslations('settings.emailTemplates')
  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        'relative flex flex-col rounded-lg border p-3 text-left transition-[opacity,background-color] hover:bg-muted',
        inUse && 'border-primary',
        pending && 'pointer-events-none opacity-50'
      )}
    >
      {inUse && (
        <Badge className="absolute right-2 top-2 z-10 text-[10px] font-semibold">
          {t('inUse')}
        </Badge>
      )}
      {onDelete && (
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={onDelete}
          disabled={pending}
          title={t('delete')}
          aria-label={t('delete')}
          className="absolute left-2 top-2 z-10 size-7 rounded-full text-destructive shadow hover:bg-destructive/10 hover:text-destructive"
        >
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      )}
      <Link
        href={href}
        target="_blank"
        rel="noopener"
        tabIndex={pending ? -1 : undefined}
        aria-disabled={pending || undefined}
        className="block"
      >
        <EmailThumbnail template={template} sample={sample} className="border border-border" />
        <p className="mt-2 truncate text-xs font-medium">{name}</p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{meta}</p>
      </Link>
      {action}
    </div>
  )
}
