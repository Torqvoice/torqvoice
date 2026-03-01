import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { headers, cookies } from 'next/headers'
import { DesktopAuthPrompt } from './desktop-auth-prompt'

export const dynamic = 'force-dynamic'

export default async function DesktopAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ code_challenge?: string; state?: string }>
}) {
  const params = await searchParams
  const codeChallenge = params.code_challenge
  const state = params.state

  // Validate required params
  if (!codeChallenge || codeChallenge.length < 43 || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Invalid authorization request.</p>
      </div>
    )
  }

  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    // Store params in cookie and redirect to sign-in
    const cookieStore = await cookies()
    cookieStore.set('desktop_auth_request', JSON.stringify({ codeChallenge, state }), {
      httpOnly: true,
      path: '/',
      maxAge: 600,
    })
    redirect('/auth/sign-in')
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <DesktopAuthPrompt
        userName={session.user.name}
        userEmail={session.user.email}
        codeChallenge={codeChallenge}
        state={state}
      />
    </div>
  )
}
