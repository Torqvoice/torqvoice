'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AlertTriangle, ArrowRight, Check, Plug, Settings2 } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CatalogEntry } from '@/features/integrations/Actions/integrationActions'
import type { IntegrationCategory } from '@/features/integrations/Lib/types'

const CATEGORY_ORDER: IntegrationCategory[] = [
  'calendar',
  'conferencing',
  'accounting',
  'messaging',
  'payments',
  'automation',
  'storage',
  'registry',
  'other',
]

/**
 * Two cards: what the workshop has set up, then what it could add. The
 * first is a plain list, since a connected service is something to check on
 * rather than shop for; the second is the browsable grid with categories.
 */
export function IntegrationsCatalog({ entries }: { entries: CatalogEntry[] }) {
  const t = useTranslations('integrations')
  const [category, setCategory] = useState<IntegrationCategory | 'all'>('all')

  const connected = useMemo(
    () => entries.filter((e) => e.status && e.status !== 'disconnected'),
    [entries]
  )
  const available = useMemo(
    () => entries.filter((e) => !e.status || e.status === 'disconnected'),
    [entries]
  )

  const categories = useMemo(() => {
    const present = new Set<IntegrationCategory>()
    for (const e of available) {
      present.add(e.manifest.category)
      for (const c of e.manifest.also ?? []) present.add(c)
    }
    return CATEGORY_ORDER.filter((c) => present.has(c))
  }, [available])

  const visible = useMemo(() => {
    const list = available.filter(
      (e) =>
        category === 'all' ||
        e.manifest.category === category ||
        e.manifest.also?.includes(category)
    )
    // The ones that matter for this workshop's country first.
    return list.sort((a, b) => Number(b.featured) - Number(a.featured))
  }, [available, category])

  return (
    <div className="space-y-4">
      <AppCard
        icon={Check}
        title={t('catalog.connectedTitle')}
        badge={connected.length || undefined}
        description={t('catalog.connectedDescription')}
        contentClassName={connected.length ? 'p-0' : undefined}
      >
        {connected.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
            {t('catalog.noneConnected')}
          </div>
        ) : (
          <ul className="divide-y">
            {connected.map((entry) => {
              const m = entry.manifest
              return (
                <li key={m.id}>
                  <Link
                    href={`/settings/integrations/${m.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                  >
                    <Image
                      src={m.logo}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 shrink-0 rounded-lg"
                      unoptimized
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        <StatusBadge entry={entry} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.status === 'error' && entry.lastError
                          ? entry.lastError
                          : (entry.externalAccountName ?? t(`categories.${m.category}`))}
                      </p>
                    </div>
                    <span className="hidden items-center gap-1 text-xs font-medium text-primary sm:inline-flex">
                      <Settings2 className="h-3.5 w-3.5" />
                      {t('catalog.manage')}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </AppCard>

      <AppCard
        icon={Plug}
        title={t('catalog.availableTitle')}
        description={t('catalog.availableDescription')}
      >
        {categories.length > 1 && (
          <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 sm:flex-wrap sm:overflow-visible">
            <Button
              variant={category === 'all' ? 'default' : 'outline'}
              size="sm"
              className="h-8 shrink-0"
              onClick={() => setCategory('all')}
            >
              {t('catalog.all')}
            </Button>
            {categories.map((c) => (
              <Button
                key={c}
                variant={category === c ? 'default' : 'outline'}
                size="sm"
                className="h-8 shrink-0"
                onClick={() => setCategory(c)}
              >
                {t(`categories.${c}`)}
              </Button>
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border text-sm text-muted-foreground">
            {available.length === 0 ? t('catalog.allConnected') : t('catalog.empty')}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((entry) => {
              const m = entry.manifest
              return (
                <Link
                  key={m.id}
                  href={`/settings/integrations/${m.id}`}
                  className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <Image
                      src={m.logo}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 shrink-0 rounded-lg"
                      unoptimized
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{m.name}</span>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {t(`connectors.${m.id}.description`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {m.capabilities.map((cap) => (
                      <Badge key={cap} variant="outline" className="text-[11px] font-normal">
                        {t(`capabilities.${cap}`)}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t(`categories.${m.category}`)}</span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      {t('catalog.connect')}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </AppCard>
    </div>
  )
}

function StatusBadge({ entry }: { entry: CatalogEntry }) {
  const t = useTranslations('integrations.statuses')
  if (!entry.status) return null
  if (entry.status === 'active')
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/30 text-[11px] text-emerald-600">
        <Check className="h-3 w-3" />
        {t('active')}
      </Badge>
    )
  if (entry.status === 'error')
    return (
      <Badge variant="outline" className="gap-1 border-destructive/30 text-[11px] text-destructive">
        <AlertTriangle className="h-3 w-3" />
        {t('error')}
      </Badge>
    )
  return (
    <Badge variant="outline" className="text-[11px] text-muted-foreground">
      {t(entry.status)}
    </Badge>
  )
}
