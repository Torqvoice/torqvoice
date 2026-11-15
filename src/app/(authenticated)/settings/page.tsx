import { redirect } from 'next/navigation'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('settings')
}

export default function SettingsPage() {
  redirect('/settings/company')
}
