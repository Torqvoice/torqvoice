import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ExternalLink, Info } from 'lucide-react'

export default async function AboutSettingsPage() {
  const t = await getTranslations('settings')
  const version = process.env.APP_VERSION || 'development'

  const links = [
    { label: t('about.website'), href: 'https://torqvoice.com/' },
    { label: t('about.documentation'), href: 'https://torqvoice.com/docs' },
    { label: t('about.changelog'), href: 'https://github.com/Torqvoice/torqvoice/releases' },
  ]

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Info className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('about.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('about.description')}
          </p>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('about.version')}</span>
              <span className="text-sm font-medium">{version}</span>
            </div>
            {links.map((link) => (
              <div key={link.href} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{link.label}</span>
                <Link
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {link.label}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
