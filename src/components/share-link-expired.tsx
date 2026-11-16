import { ClockAlert, Link2Off, Mail, Phone } from 'lucide-react'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { db } from '@/lib/db'

type ExpiredKind = 'invoice' | 'quote' | 'inspection' | 'statusReport'

/** Written in the reader's language, the way the document itself would be. */
async function readerLocale(organizationId: string) {
  const acceptLanguage = (await headers()).get('accept-language')
  return resolveCustomerLocale(organizationId, acceptLanguage)
}

/**
 * The tab title of a page whose link is closed. It never names the kind of
 * document: a link that opens nothing has no document to name.
 */
export async function closedShareLinkTitle(
  organizationId: string,
  status: 'expired' | 'gone'
): Promise<string> {
  const locale = await readerLocale(organizationId)
  const t = await getTranslations({ locale, namespace: 'share' })
  return t(`${status}.pageTitle`)
}

/**
 * The page for a link that is closed, whichever way it closed.
 *
 * Expired: the link was real and its date has passed. The page says so and
 * how to reach the workshop for a new one.
 *
 * Gone: the address names a real workshop and a token that opens nothing. A
 * link the workshop removed, one cut short on its way to the customer and
 * one that never was all get this same page, so it cannot be used to test a
 * token.
 *
 * Nothing of any document is on either page, not even its title.
 */
export async function ShareLinkClosed({
  organizationId,
  status,
  kind,
}: {
  organizationId: string
  status: 'expired' | 'gone'
  kind: ExpiredKind
}) {
  const [org, rows, locale] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.appSetting.findMany({
      where: { organizationId, key: { in: ['workshop.phone', 'workshop.email'] } },
      select: { key: true, value: true },
    }),
    readerLocale(organizationId),
  ])
  const t = await getTranslations({ locale, namespace: 'share' })

  const phone = rows.find((r) => r.key === 'workshop.phone')?.value?.trim()
  const email = rows.find((r) => r.key === 'workshop.email')?.value?.trim()
  const workshop = org?.name?.trim()

  const expired = status === 'expired'
  const Icon = expired ? ClockAlert : Link2Off
  const title = t(`${status}.title`)
  // Only an expired link says what it led to: the customer held it.
  const body = expired
    ? workshop
      ? t(`expired.body.${kind}`, { workshop })
      : t(`expired.bodyNoName.${kind}`)
    : workshop
      ? t('gone.body', { workshop })
      : t('gone.bodyNoName')

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-background p-8 pb-6 text-center shadow-sm">
        <Icon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        {(phone || email) && (
          <div className="mt-6 border-t pt-2 text-sm">
            {phone && (
              <a
                href={`tel:${phone.replace(/\s+/g, '')}`}
                className="flex min-h-11 items-center justify-center gap-2 text-foreground hover:underline"
              >
                <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {phone}
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="flex min-h-11 items-center justify-center gap-2 text-foreground hover:underline"
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

/** The page for a link past its date. */
export function ShareLinkExpired(props: { organizationId: string; kind: ExpiredKind }) {
  return <ShareLinkClosed {...props} status="expired" />
}
