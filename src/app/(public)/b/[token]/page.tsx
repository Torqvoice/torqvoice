import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getBookingPage } from '@/features/inspection-reminders/Actions/bookingActions'
import { BookingClient } from './booking-client'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await getBookingPage(token).catch(() => null)
  if (!page) notFound()
  return <BookingClient token={token} initial={page} />
}
