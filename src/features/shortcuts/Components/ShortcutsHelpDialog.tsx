'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { activeKeys } from '../Lib/preferences'
import { SHORTCUT_GROUPS, SHORTCUTS, type ShortcutGroup } from '../Lib/registry'
import { ComboCaps } from './ShortcutKeys'
import { useShortcutLabel, useShortcuts } from './ShortcutsProvider'

type Row = { id: string; label: string; keys: string[] }

/**
 * Every shortcut this person can use, with the keys they have now rather
 * than the ones the app shipped with. Opened by its own shortcut, from the
 * account menu and from the search palette.
 */
export function ShortcutsHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('settings.shortcuts')
  const { prefs, isVisible } = useShortcuts()
  const labelOf = useShortcutLabel()
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const out: { key: ShortcutGroup | 'fixed'; rows: Row[] }[] = []
    for (const group of SHORTCUT_GROUPS) {
      const rows: Row[] = []
      for (const def of SHORTCUTS) {
        if (def.group !== group || !isVisible(def)) continue
        const keys = activeKeys(def, prefs)
        if (keys.length === 0) continue
        const label = labelOf(def)
        if (needle && !label.toLowerCase().includes(needle)) continue
        rows.push({ id: def.id, label, keys })
      }
      if (rows.length > 0) out.push({ key: group, rows })
    }
    // Keys every list and photo viewer answers to. They are how those widgets
    // work rather than shortcuts, so they are told here and not offered for change.
    const fixed: Row[] = [
      {
        id: 'fixed.listMove',
        label: t('help.listMove'),
        keys: ['arrowup', 'arrowdown', 'home', 'end'],
      },
      { id: 'fixed.listOpen', label: t('help.listOpen'), keys: ['enter'] },
      { id: 'fixed.photos', label: t('help.photos'), keys: ['arrowleft', 'arrowright'] },
      { id: 'fixed.close', label: t('help.close'), keys: ['escape'] },
    ].filter((row) => !needle || row.label.toLowerCase().includes(needle))
    if (fixed.length > 0) out.push({ key: 'fixed', rows: fixed })
    return out
  }, [query, prefs, isVisible, labelOf, t])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('help.title')}</DialogTitle>
          <DialogDescription>
            {prefs.enabled ? t('help.description') : t('help.disabledNote')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('help.find')}
              aria-label={t('help.find')}
              className="pl-9"
            />
          </div>
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground" role="status">
              {t('help.noMatch')}
            </p>
          ) : (
            <div className="gap-x-8 md:columns-2">
              {groups.map((group) => (
                <section key={group.key} className="mb-5 break-inside-avoid">
                  <h3 className="mb-1 flex items-baseline gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(`groups.${group.key}`)}
                    {(group.key === 'calendar' || group.key === 'fixed') && (
                      <span className="font-normal tracking-normal normal-case">
                        {t(group.key === 'calendar' ? 'scopes.calendar' : 'help.fixedHint')}
                      </span>
                    )}
                  </h3>
                  <dl className="divide-y divide-dashed">
                    {group.rows.map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-3 py-1.5 text-sm"
                      >
                        <dt className="min-w-0">{row.label}</dt>
                        <dd className="flex shrink-0 items-center gap-1">
                          {row.keys.map((combo, index) => (
                            <Fragment key={combo}>
                              {index > 0 && group.key !== 'fixed' && (
                                <span className="text-xs text-muted-foreground">{t('or')}</span>
                              )}
                              <ComboCaps combo={combo} capClassName="text-foreground" />
                            </Fragment>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button asChild variant="outline">
            <Link href="/settings/shortcuts" onClick={() => onOpenChange(false)}>
              {t('help.customize')}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
