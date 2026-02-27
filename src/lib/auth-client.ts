import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/plugins/two-factor";

export const authClient = createAuthClient({
  basePath: "/api/public/auth",
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect: () => {
        window.location.href = "/auth/verify-2fa";
      },
    }),
    passkeyClient(),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
