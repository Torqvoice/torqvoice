'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Copy, ExternalLink, Loader2, Trash2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-dialog'
import {
  createServiceMeeting,
  removeServiceMeeting,
  type ServiceVideoCall,
} from '@/features/integrations/Actions/integrationActions'

/**
 * The work order's video call, added on purpose.
 *
 * Nothing here happens on its own: a person presses the button, the meeting
 * is created at the provider, and the link lands on the work order. The
 * customer never receives it unless someone sends it, and the panel says
 * so, because a link that quietly appeared read as an invitation already
 * gone out.
 */
export function VideoCallSection({
  serviceRecordId,
  videoCall,
  scheduled,
}: {
  serviceRecordId: string
  videoCall: ServiceVideoCall
  /** Whether the work order has a start time; a meeting follows the schedule. */
  scheduled: boolean
}) {
  const t = useTranslations('service.videoCall')
  const tp = useTranslations('integrations.meeting')
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const { link, providers } = videoCall

  if (!link && providers.length === 0) return null

  const providerLabel = (key: string) => (tp.has(key) ? tp(key) : key)

  const add = async (connectorId: string) => {
    setBusy(true)
    try {
      const res = await createServiceMeeting(serviceRecordId, connectorId)
      if (!res.success) {
        toast.error(res.error || t('failed'))
        return
      }
      toast.success(t('created'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!link) return
    const ok = await confirm({
      title: t('removeTitle'),
      description: t('removeDescription'),
      confirmLabel: t('remove'),
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await removeServiceMeeting(serviceRecordId, link.connectorId)
      if (!res.success) {
        toast.error(res.error || t('failed'))
        return
      }
      toast.success(t('removed'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success(t('copied'))
    } catch {
      toast.error(t('failed'))
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Video className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t('title')}</h3>
      </div>

      {link ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{providerLabel(link.provider)}</span>
            <span className="text-xs text-muted-foreground">
              {link.manual ? t('addedHere') : t('fromCalendar')}
            </span>
          </div>
          <code className="block select-all truncate rounded bg-muted px-2 py-1 text-xs">
            {link.url}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                {t('join')}
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              {t('copy')}
            </Button>
            {link.removable && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto text-destructive hover:text-destructive"
                onClick={remove}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                )}
                {t('remove')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t('shareHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {scheduled ? t('none') : t('needsSchedule')}
          </p>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <Button
                key={p.connectorId}
                size="sm"
                variant="outline"
                onClick={() => add(p.connectorId)}
                disabled={busy || !scheduled}
              >
                {busy ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Video className="mr-1 h-3.5 w-3.5" />
                )}
                {t('add', { provider: p.name })}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
