'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { sendQuoteEmail } from '@/features/email/Actions/emailActions'
import { SendEmailDialog } from '@/features/email/Components/SendEmailDialog'
import { revokeQuotePublicLink } from '@/features/quotes/Actions/quoteShareActions'
import { QuoteShareDialog } from '@/features/quotes/Components/QuoteShareDialog'
import { QuoteImagesManager } from '@/features/quotes/Components/QuoteImagesManager'
import { QuoteDocumentsManager } from '@/features/quotes/Components/QuoteDocumentsManager'
import {
  ArrowLeft,
  Camera,
  Download,
  FileText,
  Globe,
  Loader2,
  Mail,
  Paperclip,
  Save,
  Trash2,
} from 'lucide-react'
import { getCurrencySymbol } from '@/lib/format'
import type { QuoteAttachment, QuoteRecord, TabType } from './quote-page-types'
import { statusColors } from './quote-page-types'
import { useQuoteFormState } from './useQuoteFormState'
import { LaborPresetPickerDialog, type LaborPresetOption } from '@/features/labor-presets/Components/LaborPresetPickerDialog'
import { QuotePartsEditor } from './QuotePartsEditor'
import { QuoteLaborEditor } from './QuoteLaborEditor'
import { QuoteNotesEditor } from './QuoteNotesEditor'
import { QuoteRightColumn } from './QuoteRightColumn'
import { VehicleCombobox } from './VehicleCombobox'

const LG_BREAKPOINT = 1024

function useIsLargeScreen() {
  const [isLarge, setIsLarge] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`)
    const onChange = () => setIsLarge(mql.matches)
    mql.addEventListener('change', onChange)
    setIsLarge(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isLarge
}

export function QuotePageClient({
  quote,
  organizationId,
  currencyCode = 'USD',
  defaultTaxRate = 0,
  taxEnabled = true,
  defaultLaborRate = 0,
  laborPresets = [],
  smsEnabled = false,
  emailEnabled = false,
  imageAttachments = [],
  documentAttachments = [],
  maxImages,
  maxDocuments,
}: {
  quote: QuoteRecord
  organizationId: string
  currencyCode?: string
  defaultTaxRate?: number
  taxEnabled?: boolean
  defaultLaborRate?: number
  laborPresets?: LaborPresetOption[]
  smsEnabled?: boolean
  emailEnabled?: boolean
  imageAttachments?: QuoteAttachment[]
  documentAttachments?: QuoteAttachment[]
  maxImages?: number
  maxDocuments?: number
}) {
  const cs = getCurrencySymbol(currencyCode)
  const router = useRouter()
  const isLarge = useIsLargeScreen()
  const t = useTranslations('quotes')

  const state = useQuoteFormState({
    quote,
    currencyCode,
    defaultTaxRate,
    taxEnabled,
    defaultLaborRate,
    t,
  })

  const [showPresetPicker, setShowPresetPicker] = useState(false)

  const handleSelectPreset = useCallback(
    (preset: LaborPresetOption) => {
      const newItems = preset.items.map((item) => ({
        description: item.description,
        hours: item.hours,
        rate: item.rate > 0 ? item.rate : defaultLaborRate,
        total: item.hours * (item.rate > 0 ? item.rate : defaultLaborRate),
        excluded: false,
      }))
      state.addLaborBulk(newItems)
    },
    [defaultLaborRate, state]
  )

  const handleDescriptionChange = useCallback(
    (v: string) => {
      state.setDescription(v)
      state.markDirty()
    },
    [state]
  )
  const handleNotesChange = useCallback(
    (v: string) => {
      state.setNotes(v)
      state.markDirty()
    },
    [state]
  )
  const handleNoteTypeChange = useCallback(
    (v: 'public' | 'internal') => {
      state.setNoteType(v)
    },
    [state]
  )
  const handleRevoke = useCallback(async () => {
    await revokeQuotePublicLink(quote.id)
    router.refresh()
  }, [quote.id, router])

  const leftColumn = (
    <div className="space-y-3">
      <QuotePartsEditor
        partItems={state.partItems}
        currencyCode={currencyCode}
        partsSubtotal={state.partsSubtotal}
        onUpdate={state.updatePart}
        onDelete={state.deletePart}
        onAdd={state.addPart}
        t={t}
      />
      <QuoteLaborEditor
        laborItems={state.laborItems}
        currencyCode={currencyCode}
        cs={cs}
        laborSubtotal={state.laborSubtotal}
        onUpdate={state.updateLabor}
        onDelete={state.deleteLabor}
        onAdd={state.addLabor}
        hasPresets={laborPresets.length > 0}
        onOpenPresets={() => setShowPresetPicker(true)}
        t={t}
      />
      <QuoteNotesEditor
        noteType={state.noteType}
        onNoteTypeChange={handleNoteTypeChange}
        description={state.description}
        onDescriptionChange={handleDescriptionChange}
        notes={state.notes}
        onNotesChange={handleNotesChange}
        t={t}
      />
    </div>
  )

  const rightColumn = (
    <QuoteRightColumn
      state={state}
      quote={quote}
      organizationId={organizationId}
      currencyCode={currencyCode}
      t={t}
      onRevoke={handleRevoke}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-4 py-2">
        <div className="flex items-center justify-between">
          <Link
            href="/quotes"
            className="flex min-w-0 items-center gap-3 text-foreground transition-colors hover:text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`shrink-0 text-xs capitalize ${statusColors[state.status] || ''}`}
                >
                  {state.status}
                </Badge>
                <h1 className="truncate text-lg font-semibold leading-tight">{quote.title}</h1>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {quote.quoteNumber || t('page.quote')}
                {quote.customer ? ` · ${quote.customer.name}` : ''}
              </p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {state.hasUnsavedChanges && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {t('page.unsavedChanges')}
              </span>
            )}
            {state.showSaved && !state.hasUnsavedChanges && (
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                {t('page.saved')}
              </span>
            )}
            <Button
              type="submit"
              form="quote-form"
              size="sm"
              disabled={state.saving}
              variant={state.hasUnsavedChanges ? 'default' : 'outline'}
              className={state.hasUnsavedChanges ? 'animate-pulse' : ''}
            >
              {state.saving ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              {t('page.save')}
            </Button>
            <ButtonGroup>
              <Button
                variant="outline"
                size="sm"
                onClick={state.handleDownloadPDF}
                disabled={state.downloading}
              >
                {state.downloading ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1 h-3.5 w-3.5" />
                )}
                {t('page.pdf')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (state.hasUnsavedChanges) await state.saveNow()
                  state.setShowEmailDialog(true)
                }}
              >
                <Mail className="mr-1 h-3.5 w-3.5" />
                {t('page.email')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (state.hasUnsavedChanges) await state.saveNow()
                  state.setShowShareDialog(true)
                }}
              >
                <Globe className="mr-1 h-3.5 w-3.5" />
                {t('page.share')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={state.handleDelete}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {t('page.delete')}
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b bg-background px-4">
        <div className="flex gap-1">
          {[
            { key: 'details' as TabType, label: t('page.tabs.details'), icon: FileText },
            { key: 'images' as TabType, label: t('page.tabs.images'), icon: Camera },
            { key: 'documents' as TabType, label: t('page.tabs.documents'), icon: Paperclip },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => state.setActiveTab(key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                state.activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {state.activeTab === 'details' && (
        <form
          id="quote-form"
          ref={state.formRef}
          onSubmit={state.handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {isLarge ? (
            <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
              <ResizablePanel defaultSize={75} minSize={40}>
                <div className="h-full overflow-y-auto overscroll-contain p-4 pr-2">
                  <div className="space-y-3 pb-40">{leftColumn}</div>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={25} minSize={15}>
                <div className="h-full overflow-y-auto overscroll-contain p-4 pl-2">
                  <div className="space-y-3 pb-40">{rightColumn}</div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="space-y-3 pb-40">
                {leftColumn}
                {rightColumn}
              </div>
            </div>
          )}
        </form>
      )}

      {state.activeTab === 'images' && (
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          <div className="mx-auto max-w-4xl pb-40">
            <QuoteImagesManager
              quoteId={quote.id}
              initialImages={imageAttachments}
              maxImages={maxImages}
            />
          </div>
        </div>
      )}

      {state.activeTab === 'documents' && (
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          <div className="mx-auto max-w-4xl pb-40">
            <QuoteDocumentsManager
              quoteId={quote.id}
              initialDocuments={documentAttachments}
              maxDocuments={maxDocuments}
            />
          </div>
        </div>
      )}

      <LaborPresetPickerDialog
        open={showPresetPicker}
        onOpenChange={setShowPresetPicker}
        laborPresets={laborPresets}
        onSelectPreset={handleSelectPreset}
      />

      {/* Dialogs */}
      <SendEmailDialog
        open={state.showEmailDialog}
        onOpenChange={state.setShowEmailDialog}
        defaultEmail={quote.customer?.email || ''}
        entityLabel={t('page.entityLabel')}
        onSend={async (email, message) =>
          sendQuoteEmail({ quoteId: quote.id, recipientEmail: email, message })
        }
      />

      <QuoteShareDialog
        open={state.showShareDialog}
        onOpenChange={state.setShowShareDialog}
        quoteId={quote.id}
        organizationId={organizationId}
        initialToken={quote.publicToken}
        customer={quote.customer}
        smsEnabled={smsEnabled}
        emailEnabled={emailEnabled}
      />

      <Dialog open={state.showConvertDialog} onOpenChange={state.setShowConvertDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('page.convertTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('page.convertDescription')}</p>
            <VehicleCombobox
              value={state.convertVehicleId}
              initialVehicle={state.selectedVehicle}
              placeholder={t('details.selectVehicle')}
              noneLabel={t('details.none')}
              onChange={(id) => state.setConvertVehicleId(id)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={state.handleConvert}
                disabled={state.converting || !state.convertVehicleId}
              >
                {state.converting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('page.convert')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => state.setShowConvertDialog(false)}
              >
                {t('page.cancel')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
