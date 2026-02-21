import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/plugins/two-factor";

export const authClient = createAuthClient({
  basePath: "/api/v1/auth",
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect: () => {
        window.location.href = "/auth/verify-2fa";
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
