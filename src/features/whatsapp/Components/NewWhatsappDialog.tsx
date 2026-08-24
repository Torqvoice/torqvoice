'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Phone, Search, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { searchWhatsappRecipients } from '../Actions/whatsappActions'

export interface WhatsappRecipient {
  id: string
  name: string
  company: string | null
  phone: string | null
}

/**
 * Picks who to write to on WhatsApp.
 *
 * Unlike the SMS composer this does not carry a message box: WhatsApp decides
 * whether free text is allowed at all, and that judgement lives in the
 * conversation view. So this hands over to the thread and stops there.
 */
export function NewWhatsappDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (recipient: WhatsappRecipient) => void
}) {
  const t = useTranslations('whatsapp.messages.compose')
  const [results, setResults] = useState<WhatsappRecipient[]>([])
  const [searching, setSearching] = useState(false)

  const runSearch = async (term?: string) => {
    setSearching(true)
    const result = await searchWhatsappRecipients(term)
    setResults(result.success && result.data ? result.data : [])
    setSearching(false)
  }

  const { value: search, setValue: setSearch } = useDebouncedSearch('', runSearch)

  useEffect(() => {
    if (open) runSearch()
    // Reloading on every keystroke is the debounced search's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="h-9 pl-8"
          />
        </div>

        <div className="max-h-72 min-h-24 overflow-y-auto rounded-lg border">
          {searching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {search ? t('noMatches') : t('noRecipients')}
            </p>
          ) : (
            results.map((recipient) => (
              <button
                key={recipient.id}
                type="button"
                className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50"
                onClick={() => {
                  onSelect(recipient)
                  onOpenChange(false)
                }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {recipient.name}
                    {recipient.company && (
                      <span className="text-muted-foreground"> · {recipient.company}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {recipient.phone}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
