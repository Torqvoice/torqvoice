import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { toNextJsHandler } from "better-auth/next-js";

const { POST: authPOST, GET } = toNextJsHandler(auth);

// Path prefixes that need stricter rate limits.
// Better-auth registers sub-paths like /sign-in/email, /sign-up/email,
// /two-factor/verify-totp, etc., so we match by prefix.
const strictPrefixes: { prefix: string; limit: number; windowMs: number }[] = [
  { prefix: "/api/public/auth/sign-in", limit: 10, windowMs: 60_000 },
  { prefix: "/api/public/auth/two-factor/verify", limit: 10, windowMs: 60_000 },
  { prefix: "/api/public/auth/sign-up", limit: 5, windowMs: 60_000 },
  { prefix: "/api/public/auth/request-password-reset", limit: 5, windowMs: 60_000 },
  { prefix: "/api/public/auth/reset-password", limit: 5, windowMs: 60_000 },
];

const defaultConfig = { limit: 30, windowMs: 60_000 };

async function POST(request: Request) {
  const { pathname } = new URL(request.url);
  const config =
    strictPrefixes.find((p) => pathname.startsWith(p.prefix)) ?? defaultConfig;
  const limited = rateLimit(request, config);
  if (limited) return limited;
  return authPOST(request);
}

export { GET, POST };
