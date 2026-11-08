'use client'

import { useTranslations } from 'next-intl'
import { ButtonGroup } from '@/components/ui/button-group'
import { IconActionButton } from '@/components/icon-action-button'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Check,
  Download,
  Eye,
  Globe,
  Mail,
  MessageSquare,
  MoreVertical,
  Save,
  Trash2,
  Video,
  Printer,
} from 'lucide-react'

export interface ServiceHeaderActionsProps {
  /** Save belongs to the details form; the sections that save on their own do not need it. */
  showSave: boolean
  downloading: boolean
  saving: boolean
  hasUnsavedChanges?: boolean
  showSaved?: boolean
  onDownloadPDF: () => void
  onPreviewPDF: () => void
  /** The work order as a sheet to print and sign, opened in the preview. */
  onPrintWorkOrder?: () => void
  onDelete: () => void
  onShowEmail: () => void
  onShowShare: () => void
  onNotifyCustomer?: () => void
  hasCustomer?: boolean
  /** The invoice-design submenu, when this invoice has a frozen look to change. */
  designMenu?: React.ReactNode
  /** Video call link from a connected calendar, when one exists. */
  meetingUrl?: string | null
}

/**
 * Everything that can be done with the job as a whole: save it, look at the
 * invoice, send it, tell the customer, and the rest behind the menu. Drawn in
 * the page's header.
 */
export function ServiceHeaderActions({
  showSave,
  downloading,
  saving,
  hasUnsavedChanges = false,
  showSaved = false,
  onDownloadPDF,
  onPreviewPDF,
  onPrintWorkOrder,
  onDelete,
  onShowEmail,
  onShowShare,
  onNotifyCustomer,
  hasCustomer = false,
  designMenu,
  meetingUrl = null,
}: ServiceHeaderActionsProps) {
  const t = useTranslations('service.header')
  const tPreview = useTranslations('common.pdfPreview')

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {showSave && (
        <>
          {/* The save state is shown on the Save button itself, as a dot while
              there are unsaved changes and a check once saved, with the words
              in its tooltip. A text label beside it changed the row's width,
              which pushed the buttons onto a second line on every edit. Screen
              readers still hear the words, from this status line. */}
          <span role="status" className="sr-only">
            {hasUnsavedChanges ? t('unsavedChanges') : showSaved ? t('saved') : ''}
          </span>
          <IconActionButton
            type="submit"
            form="service-record-form"
            label={t('save')}
            tooltip={
              hasUnsavedChanges
                ? `${t('save')} · ${t('unsavedChanges')}`
                : showSaved
                  ? t('saved')
                  : t('save')
            }
            icon={Save}
            loading={saving}
            variant={hasUnsavedChanges ? 'default' : 'outline'}
            className={hasUnsavedChanges ? 'animate-pulse' : ''}
            badge={
              hasUnsavedChanges ? (
                <span
                  aria-hidden="true"
                  className="-right-1 -top-1 absolute size-2.5 rounded-full bg-amber-500 ring-2 ring-background"
                />
              ) : showSaved ? (
                <span
                  aria-hidden="true"
                  className="-right-1.5 -top-1.5 absolute flex size-3.5 items-center justify-center rounded-full bg-green-600 text-white ring-2 ring-background"
                >
                  <Check className="size-2.5" />
                </span>
              ) : undefined
            }
          />
        </>
      )}
      <ButtonGroup>
        <IconActionButton label={tPreview('preview')} icon={Eye} onClick={onPreviewPDF} />
        <IconActionButton
          label={t('pdf')}
          icon={Download}
          loading={downloading}
          onClick={onDownloadPDF}
        />
        <IconActionButton label={t('email')} icon={Mail} onClick={onShowEmail} />
        <IconActionButton label={t('share')} icon={Globe} onClick={onShowShare} />
        {meetingUrl && (
          <IconActionButton
            label={t('joinCall')}
            icon={Video}
            onClick={() => window.open(meetingUrl, '_blank', 'noopener')}
          />
        )}
        {hasCustomer && onNotifyCustomer && (
          <IconActionButton label={t('notify')} icon={MessageSquare} onClick={onNotifyCustomer} />
        )}
        {/* The row already carries six actions in twelve languages. New
            ones go in here rather than widening it, and Delete moved in
            with them: a destructive button one pixel from Share is a
            misclick waiting to happen. */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t('moreActions')}
                >
                  <MoreVertical className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('moreActions')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-56">
            {onPrintWorkOrder && (
              <>
                <DropdownMenuItem onClick={onPrintWorkOrder}>
                  <Printer className="mr-2 size-4" aria-hidden="true" />
                  {t('printWorkOrder')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {designMenu && (
              <>
                {designMenu}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 size-4" aria-hidden="true" />
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    </div>
  )
}
