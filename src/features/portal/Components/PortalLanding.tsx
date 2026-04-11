import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, Mail, MapPin, Phone } from 'lucide-react'
import { PortalLoginForm } from './PortalLoginForm'

export type PortalLandingProps = {
  orgId: string
  orgName: string
  orgLogo: string | null
  description: string | null
  hours: string | null
  address: string | null
  phone: string | null
  email: string | null
  authError?: string
}

export async function PortalLanding({
  orgId,
  orgName,
  orgLogo,
  description,
  hours,
  address,
  phone,
  email,
  authError,
}: PortalLandingProps) {
  const t = await getTranslations('portal.landing')

  const hasContact = Boolean(address || phone || email || hours)

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Hero */}
        <header className="mb-10 flex flex-col items-center text-center sm:mb-14">
          {orgLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt={orgName}
              className="mb-5 h-20 w-20 rounded-xl object-contain sm:h-24 sm:w-24"
            />
          ) : (
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-xl bg-primary/10 text-3xl font-bold text-primary sm:h-24 sm:w-24">
              {orgName.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{orgName}</h1>
          {description && (
            <p className="mt-4 max-w-2xl whitespace-pre-line text-base text-muted-foreground sm:text-lg">
              {description}
            </p>
          )}
        </header>

        {/* Two-column: contact info | login */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {hasContact ? (
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>{t('contactTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {address && (
                    <ContactRow icon={<MapPin className="h-5 w-5" />} label={t('address')}>
                      <p className="whitespace-pre-line">{address}</p>
                    </ContactRow>
                  )}
                  {phone && (
                    <ContactRow icon={<Phone className="h-5 w-5" />} label={t('phone')}>
                      <a href={`tel:${phone}`} className="hover:underline">
                        {phone}
                      </a>
                    </ContactRow>
                  )}
                  {email && (
                    <ContactRow icon={<Mail className="h-5 w-5" />} label={t('email')}>
                      <a href={`mailto:${email}`} className="break-all hover:underline">
                        {email}
                      </a>
                    </ContactRow>
                  )}
                  {hours && (
                    <ContactRow icon={<Clock className="h-5 w-5" />} label={t('hours')}>
                      <p className="whitespace-pre-line">{hours}</p>
                    </ContactRow>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>{t('aboutTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{t('noContactInfo')}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2">
            <PortalLoginForm orgId={orgId} error={authError} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ContactRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  )
}
