'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { ShareChannelStatus } from '../Actions/getShareChannels'

interface NotifyChannelOptionProps {
  id: string
  icon: ReactNode
  /** The channel's name as the workshop knows it: "SMS". */
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Undefined while the dialog is still asking. */
  status: ShareChannelStatus | undefined
  isCloud: boolean
  /** Said after the label when the customer cannot be reached this way. */
  missingContact?: string | null
}

/**
 * One channel in a share dialog's "Notify" box.
 *
 * Always drawn. A channel the workshop has not set up is disabled and says
 * what to do about it, with the way there: hidden, nobody found out that a
 * quote or an invoice could go out by text at all.
 */
export function NotifyChannelOption({
  id,
  icon,
  label,
  checked,
  onCheckedChange,
  status,
  isCloud,
  missingContact,
}: NotifyChannelOptionProps) {
  const t = useTranslations('common.shareLink')
  const ts = useTranslations('settings.featureLocked')

  const usable = status === 'ready' && !missingContact
  const hintId = `${id}-hint`
  const hasHint = status === 'not_connected' || status === 'not_in_plan'

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={usable && checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          disabled={!usable}
          aria-describedby={hasHint ? hintId : undefined}
        />
        <Label
          htmlFor={id}
          className={`flex items-center gap-1.5 text-sm ${usable ? '' : 'text-muted-foreground/50'}`}
        >
          {icon}
          {label}
          {!hasHint && missingContact && <span className="text-xs">{missingContact}</span>}
        </Label>
      </div>
      {status === 'not_connected' && (
        <p id={hintId} className="pl-6 text-xs text-muted-foreground">
          {t('channelNotConnected', { channel: label })}{' '}
          <Link href="/settings/integrations" className="font-medium text-primary hover:underline">
            {t('openIntegrations')}
          </Link>
        </p>
      )}
      {status === 'not_in_plan' && (
        <p id={hintId} className="pl-6 text-xs text-muted-foreground">
          {t('channelNotInPlan', { channel: label })}{' '}
          <Link
            href={isCloud ? '/settings/subscription' : '/settings/license'}
            className="font-medium text-primary hover:underline"
          >
            {isCloud ? ts('upgradePlan') : ts('activateLicense')}
          </Link>
        </p>
      )}
    </div>
  )
}
