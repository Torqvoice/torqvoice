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
          {/* The label slot is always as wide as the longer of the two labels,
              so the buttons stay put when "Unsaved changes" or "Saved" comes and
              goes. Before, the extra width pushed the whole row onto a second
              line on every edit. The sizers draw their words as CSS content, so
              they are not text a reader or a test finds. */}
          <span className="grid items-center justify-items-end text-xs font-medium">
            <span
              aria-hidden="true"
              data-size={t('unsavedChanges')}
              className="invisible col-start-1 row-start-1 whitespace-nowrap after:content-[attr(data-size)]"
            />
            <span
              aria-hidden="true"
              data-size={t('saved')}
              className="invisible col-start-1 row-start-1 whitespace-nowrap after:content-[attr(data-size)]"
            />
            {hasUnsavedChanges && (
              <span className="col-start-1 row-start-1 whitespace-nowrap text-amber-600 dark:text-amber-400">
                {t('unsavedChanges')}
              </span>
            )}
            {showSaved && !hasUnsavedChanges && (
              <span className="col-start-1 row-start-1 whitespace-nowrap text-green-600 dark:text-green-400">
                {t('saved')}
              </span>
            )}
          </span>
          <IconActionButton
            type="submit"
            form="service-record-form"
            label={t('save')}
            icon={Save}
            loading={saving}
            variant={hasUnsavedChanges ? 'default' : 'outline'}
            className={hasUnsavedChanges ? 'animate-pulse' : ''}
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
