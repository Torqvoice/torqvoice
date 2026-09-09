# End-to-end tests

The vitest suite mocks Prisma, so it proves the actions think correctly and
nothing else. These tests run the built app in a browser against a real
Postgres, and cover what only breaks once the pieces are assembled: migrations,
the session cookie, server actions wired to forms, and invoice numbering.

## Layout

```
e2e/
  auth.setup.ts        signs in once; every spec starts with that session
  prepare-db.ts        reset + seed, run ahead of the server
  support/             helpers specs share: database peeks, TOTP, work order driving
  specs/
    auth/              sign-in, sign-up and invitations, account security
    work-orders/       pricing under each tax setting, quote to invoice
    smoke/             the build is alive
```

One folder per area of the app, one file per flow. A new area gets a new folder;
a helper used by more than one spec goes under `support/`.

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

The suite resets `E2E_DATABASE_URL` to a clean schema, runs the demo seed,
starts `next start` on port 3100, signs in once, and reuses that session.

If something is already listening on port 3100, the suite uses it as it is and
skips the reset, so a second run continues on the data the first one left. Stop
that server when you want a clean slate.

`npm run test:e2e:ui` opens Playwright's watch mode, which is the sane way to
write a new spec.

## When Playwright has no browser for your machine

Playwright only ships Chromium for the operating systems it supports; on an
older Debian, `playwright install` refuses. Run the browser from Playwright's
own image instead, against a server started here:

```bash
export E2E_DATABASE_URL="postgresql://torqvoice:torqvoice@localhost:5432/torqvoice_e2e"
npx tsx e2e/prepare-db.ts
DATABASE_URL="$E2E_DATABASE_URL" NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100 \
  DEMO_MODE=false AUTH_RATE_LIMIT=off TORQVOICE_MODE=self-hosted npm run start -- --port 3100 &
docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/work -w /work \
  -e E2E_BASE_URL=http://127.0.0.1:3100 -e E2E_SKIP_SEED=1 -e E2E_DATABASE_URL \
  mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test
```

The image version must match `@playwright/test` in package.json.

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
| `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` | `demo@torqvoice.com` / `demo-e2e-pass` | The login the seed creates and the suite signs in with |
| `E2E_TZ` | `Europe/Oslo` | Browser and server timezone |

The suite's own server also runs with `TORQVOICE_MODE=self-hosted`, `DEMO_MODE=false` and
`AUTH_RATE_LIMIT=off`. Pointed at another server, start it the same way or the plan
limits, demo guards and sign-in limiter get in the way of the tests.

## Rules that keep this suite worth having

**The build must be made with the base URL the tests use.**
`NEXT_PUBLIC_APP_URL` is baked into the client bundle, and better-auth refuses a
sign-in from an origin it was not built for.

**Never point `E2E_DATABASE_URL` at a database you care about.** The setup runs
`prisma migrate reset`. There is a guard on the database name, and
`E2E_ALLOW_ANY_DB=1` removes it, so think before reaching for that.

**Pin the language.** Selectors read visible English. The config sets the
locale, and the saved session carries a `locale=en` cookie.

**The sign-in rate limit is off on the suite's own server** (`AUTH_RATE_LIMIT=off`). Pointed at
another server, keep sign-ins in a spec ten seconds apart or the third one is refused.

**Demo mode stays off.** It blocks invites, billing and outbound messages, which
are behaviours a test should be able to exercise.

**Prefer a role or a stable id over a class.** Where an element has neither, add
`data-testid` to the component rather than reaching through the DOM.
