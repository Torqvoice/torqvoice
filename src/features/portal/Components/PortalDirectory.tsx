'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight, Search } from 'lucide-react'

export type PortalDirectoryEntry = {
  slug: string
  name: string
  logo: string | null
  address: string | null
}

export function PortalDirectory({ workshops }: { workshops: PortalDirectoryEntry[] }) {
  const t = useTranslations('portal.directory')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return workshops
    return workshops.filter(
      (w) => w.name.toLowerCase().includes(q) || (w.address?.toLowerCase().includes(q) ?? false)
    )
  }, [workshops, query])

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">{t('description')}</p>
        </header>

        {workshops.length > 0 && (
          <div className="mx-auto mb-8 max-w-md">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="pl-9"
                aria-label={t('searchPlaceholder')}
              />
            </div>
          </div>
        )}

        {workshops.length === 0 ? (
          <p className="mt-12 text-center text-muted-foreground">{t('noWorkshops')}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-12 text-center text-muted-foreground">{t('noResults')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((workshop) => (
              <li key={workshop.slug}>
                <Link
                  href={`/portal/${workshop.slug}/auth/login`}
                  className="group block focus:outline-none"
                >
                  <Card className="h-full transition-all group-hover:border-primary/40 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
                    <CardContent className="flex items-center gap-4">
                      {workshop.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={workshop.logo}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-lg object-contain"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xl font-bold text-primary">
                          {workshop.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-base font-semibold">{workshop.name}</h2>
                        {workshop.address && (
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {workshop.address}
                          </p>
                        )}
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                          {t('openPortal')}
                          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
