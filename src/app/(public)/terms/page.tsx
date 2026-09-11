import { permanentRedirect } from 'next/navigation'
import { TERMS_URL } from '@/lib/marketing-urls'

// The terms are maintained once, on the marketing site. This route stays
// only so that links in older emails and bookmarks still land somewhere.
export default function TermsOfServicePage() {
  permanentRedirect(TERMS_URL)
}
