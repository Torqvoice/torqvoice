# End-to-end tests

The vitest suite mocks Prisma, so it proves the actions think correctly and
nothing else. These tests run the built app in a browser against a real
Postgres, and cover what only breaks once the pieces are assembled: migrations,
the session cookie, server actions wired to forms, and invoice numbering.

## One-time setup

```bash
npx playwright install --with-deps chromium
createdb torqvoice_e2e   # any empty database whose name contains "e2e" or "test"
```

## Running

```bash
export E2E_DATABASE_URL="postgresql://torqvoice:torqvoice@localhost:5432/torqvoice_e2e"
npm run build          # NEXT_PUBLIC_APP_URL must match the base URL below
npm run test:e2e
```

The suite starts `next start` on port 3100 itself, resets `E2E_DATABASE_URL` to
a clean schema, runs the demo seed, signs in once, and reuses that session.

`npm run test:e2e:ui` opens Playwright's watch mode, which is the sane way to
write a new spec.

## Pointing it at something already running

```bash
E2E_BASE_URL=https://staging.torqvoice.com E2E_SKIP_SEED=1 npm run test:e2e
```

With `E2E_BASE_URL` set, no server is started. With `E2E_SKIP_SEED=1`, the
database is left alone, which is what you want against a shared environment.

## Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `E2E_DATABASE_URL` | required | The database the suite resets and seeds |
| `E2E_BASE_URL` | starts its own server on `127.0.0.1:3100` | Test an existing instance |
| `E2E_SKIP_SEED` | unset | Leave the database untouched |
| `E2E_ALLOW_ANY_DB` | unset | Override the guard on database names |
| `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` | `demo@torqvoice.com` / `demo` | Seeded login |
| `E2E_TZ` | `Europe/Oslo` | Browser and server timezone |

## Rules that keep this suite worth having

**The build must be made with the base URL the tests use.**
`NEXT_PUBLIC_APP_URL` is baked into the client bundle, and better-auth refuses a
sign-in from an origin it was not built for.

**Never point `E2E_DATABASE_URL` at a database you care about.** The setup runs
`prisma migrate reset`. There is a guard on the database name, and
`E2E_ALLOW_ANY_DB=1` removes it, so think before reaching for that.

**Pin the language.** Selectors read visible English. The config sets the
locale, and the saved session carries a `locale=en` cookie.

**Demo mode stays off.** It blocks invites, billing and outbound messages, which
are behaviours a test should be able to exercise.

**Prefer a role or a stable id over a class.** Where an element has neither, add
`data-testid` to the component rather than reaching through the DOM.
