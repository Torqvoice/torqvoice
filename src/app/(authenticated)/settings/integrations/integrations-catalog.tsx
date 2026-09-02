'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AlertTriangle, ArrowRight, Check, Plug } from 'lucide-react'
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

export function IntegrationsCatalog({ entries }: { entries: CatalogEntry[] }) {
  const t = useTranslations('integrations')
  const [category, setCategory] = useState<IntegrationCategory | 'all'>('all')

  const categories = useMemo(() => {
    const present = new Set<IntegrationCategory>()
    for (const e of entries) {
      present.add(e.manifest.category)
      for (const c of e.manifest.also ?? []) present.add(c)
    }
    return CATEGORY_ORDER.filter((c) => present.has(c))
  }, [entries])

  const visible = useMemo(() => {
    const list = entries.filter(
      (e) =>
        category === 'all' ||
        e.manifest.category === category ||
        e.manifest.also?.includes(category)
    )
    // Connected first, then the ones that matter for this workshop's country.
    return list.sort((a, b) => {
      const ac = a.status ? 0 : 1
      const bc = b.status ? 0 : 1
      if (ac !== bc) return ac - bc
      return Number(b.featured) - Number(a.featured)
    })
  }, [entries, category])

  return (
    <AppCard icon={Plug} title={t('catalog.title')} description={t('catalog.description')}>
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

      {visible.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border text-sm text-muted-foreground">
          {t('catalog.empty')}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      <StatusBadge entry={entry} />
                    </div>
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
                  <span className="text-muted-foreground">
                    {entry.externalAccountName ?? (entry.status ? '' : t('catalog.notConnected'))}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    {entry.status ? t('catalog.manage') : t('catalog.connect')}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </AppCard>
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
