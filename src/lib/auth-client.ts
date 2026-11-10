import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/plugins/two-factor'
import { twoFactorUrlFor } from './signed-out'

export const authClient = createAuthClient({
  basePath: '/api/public/auth',
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect: () => {
        window.location.href = twoFactorUrlFor(window.location.search)
      },
    }),
    passkeyClient(),
  ],
})

export const { signIn, signUp, signOut, useSession } = authClient
