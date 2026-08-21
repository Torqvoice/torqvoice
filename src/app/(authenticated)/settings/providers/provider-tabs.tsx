'use client'

import type { ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Lock } from 'lucide-react'

export interface ProviderPanel {
  key: string
  label: string
  /** Rendered on the server and handed over already built. */
  content: ReactNode
  /** The plan does not include this channel; the tab stays visible and explains why. */
  locked?: boolean
}

/**
 * One page for every channel a workshop can reach customers on.
 *
 * They were separate sidebar entries, which put four near-identical pages in a
 * list that a workshop reads top to bottom looking for the one it wants. As
 * tabs they sit side by side, which is how they are actually compared.
 *
 * The active tab lives in the URL so a link to a specific provider, and a
 * reload after saving, both land where the workshop was.
 */
export function ProviderTabs({
  panels,
  defaultTab,
}: {
  panels: ProviderPanel[]
  defaultTab: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const requested = searchParams.get('tab')
  const active = panels.some((panel) => panel.key === requested)
    ? (requested as string)
    : defaultTab

  return (
    <Tabs
      value={active}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', next)
        // Replace rather than push: flicking through tabs should not fill the
        // back button with settings pages.
        router.replace(`?${params.toString()}`, { scroll: false })
      }}
      className="w-full"
    >
      <TabsList className="mb-6 w-full justify-start overflow-x-auto">
        {panels.map((panel) => (
          <TabsTrigger key={panel.key} value={panel.key} className="gap-1.5">
            {panel.locked && <Lock className="h-3 w-3 opacity-60" />}
            {panel.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {panels.map((panel) => (
        <TabsContent key={panel.key} value={panel.key} className="mt-0">
          {panel.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
