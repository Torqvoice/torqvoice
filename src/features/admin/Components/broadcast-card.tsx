'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Megaphone } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BroadcastBanner } from '@/components/broadcast-banner'
import { setSystemSettings } from '../Actions/setSystemSettings'
import {
  BROADCAST_LEVELS,
  BROADCAST_MAX_LENGTH,
  SYSTEM_SETTING_KEYS,
  type BroadcastLevel,
} from '../Schema/systemSettingsSchema'

/**
 * The platform-wide notice, posted and cleared from here.
 *
 * Saves on its own rather than joining the page's single Save button. This is
 * the one setting on the page that gets touched mid-incident, and clearing it
 * afterwards should not mean scrolling past the whole mail configuration to
 * find a button that also rewrites everything else.
 */
export function BroadcastCard({
  initialMessage,
  initialLevel,
}: {
  initialMessage: string
  initialLevel: BroadcastLevel
}) {
  const t = useTranslations('common.broadcast')
  const [message, setMessage] = useState(initialMessage)
  const [level, setLevel] = useState<BroadcastLevel>(initialLevel)
  const [isPending, startTransition] = useTransition()

  const save = (text: string, cleared: boolean) => {
    startTransition(async () => {
      const result = await setSystemSettings({
        [SYSTEM_SETTING_KEYS.BROADCAST_MESSAGE]: text,
        [SYSTEM_SETTING_KEYS.BROADCAST_LEVEL]: level,
      })
      if (!result.success) {
        toast.error(result.error ?? 'Failed to save')
        return
      }
      setMessage(text)
      toast.success(cleared ? t('cleared') : t('posted'))
    })
  }

  const trimmed = message.trim()

  return (
    <AppCard
      icon={Megaphone}
      title={t('title')}
      description={t('description')}
      contentClassName="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="broadcast-message">{t('message')}</Label>
        <Textarea
          id="broadcast-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={BROADCAST_MAX_LENGTH}
          rows={3}
          placeholder={t('placeholder')}
        />
        <p className="text-right text-xs text-muted-foreground tabular-nums">
          {trimmed.length} / {BROADCAST_MAX_LENGTH}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t('level')}</Label>
        <div className="flex flex-wrap gap-2">
          {BROADCAST_LEVELS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={level === option ? 'default' : 'outline'}
              onClick={() => setLevel(option)}
            >
              {t(
                option === 'info'
                  ? 'levelInfo'
                  : option === 'warning'
                    ? 'levelWarning'
                    : 'levelCritical'
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* The real banner, not a mock-up of one. Anything that goes to every
          screen in every workshop is worth seeing before it does. */}
      {trimmed.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <BroadcastBanner
            preview
            broadcast={{ message: trimmed, level, updatedAt: 'preview' }}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save(trimmed, false)} disabled={isPending || !trimmed}>
          {t('post')}
        </Button>
        <Button
          variant="outline"
          onClick={() => save('', true)}
          disabled={isPending || initialMessage.length === 0}
        >
          {t('clear')}
        </Button>
      </div>
    </AppCard>
  )
}
