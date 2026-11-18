import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { AppSetupLanding } from './app-setup-landing'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.team')
  return {
    // The heading the landing itself shows.
    title: t('setupPageTitle'),
    // Nothing here is worth indexing, and the page only means anything to
    // somebody holding a code that dies in ten minutes.
    robots: { index: false, follow: false },
  }
}

/**
 * Where a technician's own camera lands when they scan the desk's QR.
 *
 * The app's scanner reads that QR directly and never comes here. This page
 * exists because the first thing anybody does with a QR is point their phone's
 * camera at it, and without a page behind the URL that gesture produces a
 * text editor full of JSON and a technician who thinks it is broken.
 */
export default function AppSetupPage() {
  return <AppSetupLanding />
}
