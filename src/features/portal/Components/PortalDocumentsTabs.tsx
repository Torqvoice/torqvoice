import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

const TABS = ['invoices', 'quotes', 'inspections'] as const

/**
 * Invoices | Quotes | Inspections, at the top of each of the three document
 * lists. Three links in the theme's segmented shape, the open one marked:
 * full width on a phone, as wide as its words on a desk.
 */
export async function PortalDocumentsTabs({
  orgId,
  active,
}: {
  orgId: string
  active: 'invoices' | 'quotes' | 'inspections'
}) {
  const t = await getTranslations('portal.nav')

  return (
    <nav aria-label={t('documents')} className="mb-6">
      <ul className="grid grid-cols-3 gap-1 rounded-[var(--p-radius-control)] border bg-[var(--p-soft)] p-1 sm:inline-grid">
        {TABS.map((tab) => (
          <li key={tab} className="min-w-0">
            <Link
              href={`/portal/${orgId}/${tab}`}
              aria-current={tab === active ? 'page' : undefined}
              className={[
                'flex min-h-11 items-center justify-center rounded-[var(--p-radius-control)] px-3 text-center text-[15px] font-semibold leading-tight sm:px-6',
                tab === active
                  ? 'p-ink bg-[var(--p-surface)] shadow-[0_0_0_1px_var(--p-line)]'
                  : 'p-muted hover:underline',
              ].join(' ')}
            >
              {t(tab)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
