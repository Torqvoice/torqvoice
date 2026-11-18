import { titleFrom } from '@/lib/page-title'

// The page is a client component, so its tab title is set here.
export function generateMetadata() {
  return titleFrom('auth.resetPassword', 'title')
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
