import { ClockAlert, Mail, Phone } from 'lucide-react'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { db } from '@/lib/db'

type ExpiredKind = 'invoice' | 'quote' | 'inspection' | 'statusReport'

/**
 * What a customer sees when the link they were sent has expired: that it
 * has, and how to reach the workshop for a new one. Nothing of the document
 * is on the page, not even its title.
 *
 * Written in the reader's language, the way the document itself would be.
 */
export async function ShareLinkExpired({
  organizationId,
  kind,
}: {
  organizationId: string
  kind: ExpiredKind
}) {
  const [org, rows, acceptLanguage] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.appSetting.findMany({
      where: { organizationId, key: { in: ['workshop.phone', 'workshop.email'] } },
      select: { key: true, value: true },
    }),
    headers().then((h) => h.get('accept-language')),
  ])
  const locale = await resolveCustomerLocale(organizationId, acceptLanguage)
  const t = await getTranslations({ locale, namespace: 'share.expired' })

  const phone = rows.find((r) => r.key === 'workshop.phone')?.value?.trim()
  const email = rows.find((r) => r.key === 'workshop.email')?.value?.trim()
  const workshop = org?.name?.trim()

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-background p-8 text-center shadow-sm">
        <ClockAlert className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {workshop ? t(`body.${kind}`, { workshop }) : t(`bodyNoName.${kind}`)}
        </p>
        {(phone || email) && (
          <div className="mt-6 space-y-2 border-t pt-4 text-sm">
            {phone && (
              <a
                href={`tel:${phone.replace(/\s+/g, '')}`}
                className="flex items-center justify-center gap-2 text-foreground hover:underline"
              >
                <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {phone}
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="flex items-center justify-center gap-2 text-foreground hover:underline"
              >
                <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {email}
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
