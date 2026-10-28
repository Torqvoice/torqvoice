import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { SetupWizard } from '@/features/onboarding/Components/setup/SetupWizard'
import { SingleWorkshopNotice } from '@/features/onboarding/Components/SingleWorkshopNotice'
import { organizationAllowance } from '@/lib/features'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const params = await searchParams
  const redirectTo = params.redirect ? safeRedirectPath(params.redirect) : undefined
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user?.id) {
    redirect('/auth/sign-in')
  }

  // If user already has an org, skip onboarding
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true },
  })

  if (membership) {
    redirect('/')
  }

  // A self-hosted install runs one workshop unless licensed for more. Someone
  // who signed up after it was opened is not starting a second one; they are
  // joining the first, which takes an invitation from its owner.
  const allowance = await organizationAllowance(session.user.id)

  return (
    <div
      className={`grid-bg relative flex min-h-screen justify-center px-4 py-8 sm:px-6 sm:py-10 ${allowance.allowed ? 'items-start' : 'items-center'}`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>
      {allowance.allowed ? (
        <SetupWizard redirectTo={redirectTo} />
      ) : (
        <SingleWorkshopNotice email={session.user.email} />
      )}
    </div>
  )
}
