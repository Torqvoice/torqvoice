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
  mail-sink.ts         a mail server that delivers nothing and keeps everything
  payment-sink.ts      Stripe and PayPal as far as the app can tell; no money moves
  google-standin.ts    Google's account chooser and token endpoint, for the cloud run
  support/             helpers specs share: reading mail, reading a PDF's text,
                       database peeks, TOTP, work order driving
  specs/
    auth/              sign-in, sign-up and invitations, account security
    invoices/          numbering, paying an invoice down, one document four ways,
                       what the job's own files do to it, the designer
                       and its drags
    work-orders/       pricing under each tax setting, quote to invoice,
                       the lifecycle of a job, what the editor refuses,
                       the shape of the page at both breakpoints
    quotes/            the quote a customer is handed
    calendar/          a booking keeps the time it was made at, in the
                       workshop's own timezone
    inventory/         a stocked part leaves the shelf exactly once
    reminders/         a due time survives being displayed and re-saved
    email/             the email template designer, and the mail it sends
    payments/          a customer pays online, and the payment is booked once
    security/          the doors the September 2026 audit found open: admin-only
                       actions, file paths, payment attribution, webhook signatures
    cloud/             run with E2E_MODE=cloud: plan limits, Google sign-in, the sign-up pitch
    tech/              the technician app's API contract
    smoke/             the build is alive
```

One folder per area of the app, one file per flow. A new area gets a new folder;
a helper used by more than one spec goes under `support/`.

The app the suite starts runs with `DISABLE_BACKGROUND_JOBS=1`. Its schedulers would
otherwise tick through the run: the due-reminder scan stamps `notifiedAt` on rows a spec
is asserting on, the message and webhook processors send things, and all of them compete
for the single CPU a serial suite is using. A spec that needs one of them should call the
processor directly rather than wait for a timer.

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
starts the mail sink and `next start` on port 3100, signs in once, and reuses
that session.

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
export BETTER_AUTH_SECRET=$(grep -oP '^BETTER_AUTH_SECRET="?\K[^"]+' .env)
npx tsx e2e/prepare-db.ts
DATABASE_URL="$E2E_DATABASE_URL" NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100 \
  DEMO_MODE=false AUTH_RATE_LIMIT=off TORQVOICE_MODE=self-hosted \
  SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_FROM_EMAIL=workshop@e2e.test \
  npm run start -- --port 3100 &
docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/work -w /work \
  -e E2E_BASE_URL=http://127.0.0.1:3100 -e E2E_SKIP_SEED=1 -e E2E_DATABASE_URL \
  -e BETTER_AUTH_SECRET \
  mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test
```

The image version must match `@playwright/test` in package.json. The secret goes in
because the two-factor spec decrypts what the server stored, and a server started
here takes its own from `.env`. The SMTP variables point the server at the mail
sink, which Playwright starts inside the container; `--network host` is what puts
them on the same localhost.

## Pointing it at something already running

```bash
E2E_BASE_URL=https://staging.torqvoice.com E2E_SKIP_SEED=1 npm run test:e2e
```

With `E2E_BASE_URL` set, no app server is started. With `E2E_SKIP_SEED=1`, the
database is left alone, which is what you want against a shared environment.

The mail sink still starts, but a server elsewhere sends its mail elsewhere,
so the two specs that read mail (the invitation and the password reset) cannot
pass against a shared environment unless that server is pointed here too.

## The mail sink

Two things a workshop does can only be tested by reading the mail: an
invitation is a link and nothing else, and the app deletes an invitation it
could not send. So the harness runs its own mail server, `e2e/mail-sink.ts`.
It speaks SMTP on port 1025, delivers nothing, keeps what it is given in
memory, and hands it back over HTTP on port 8025. Playwright starts and stops
it with everything else, so there is nothing to install or remember.

The app is pointed at it with `SMTP_HOST` and `SMTP_PORT`, which is all it
takes: SMTP is the default provider, and the seeded workshop configures none
of its own. A spec reads what was sent through `support/mail.ts`:

```ts
const mail = await waitForMail('someone@example.com')
await page.goto(linkIn(mail, /\/auth\/sign-up\?invite=/))
```

`clearMailbox()` empties it, which is worth doing before an action whose mail
you are about to read twice in one file.

## In CI

`.github/workflows/e2e.yml` runs the suite on every pull request to main, and on
demand from the Actions tab. The specs are split into four shards
(`--shard=1/4` and so on) plus a job for the cloud specs, all at once. Each job
has its own `postgres:16-alpine` service holding `torqvoice_e2e`, installs
Chromium, builds with `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100`, and seeds its
own database, so the one-test-at-a-time rule still holds inside every job.
A spec that only passes because another file ran before it will fail here.

To run one shard the way CI does:

```bash
npx playwright test --shard=2/4
```

On CI every job writes a blob report, and the last job, `Playwright`, merges them
into one HTML report uploaded as the `playwright-report` artifact. It is green
only when every shard and the cloud job are. Open a downloaded report with
`npx playwright show-report`.

## Reading a PDF

`support/pdf.ts` turns a PDF into its text (`unpdf`, which is pdf.js underneath), so a
spec can assert what a customer actually reads rather than that a file arrived:

```ts
const pdf = await pdfContent(await response.body())
expect(pdf.flat).toContain('Total $4,312.50')
expect(pdf.text).toContain('Gates WP-4471\nwith gasket and coolant')
```

`makePdf(['page one', 'page two'])` builds a small PDF to attach to a job, and
`TINY_PNG` / `BROKEN_PNG` are a valid photograph and a truncated one.

`flat` collapses all whitespace, for phrases that span a line break in the layout;
`text` keeps the lines, which is how a multi-line description is checked. `size` is the
file's own weight — a logo or QR code that goes missing changes nothing about the words,
so parity checks compare both.

## Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `E2E_DATABASE_URL` | required | The database the suite resets and seeds |
| `E2E_BASE_URL` | starts its own server on `127.0.0.1:3100` | Test an existing instance |
| `E2E_SKIP_SEED` | unset | Leave the database untouched |
| `E2E_ALLOW_ANY_DB` | unset | Override the guard on database names |
| `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` | `demo@torqvoice.com` / `demo-e2e-pass` | The login the seed creates and the suite signs in with |
| `E2E_TZ` | `Europe/Oslo` | Browser and server timezone |
| `E2E_SMTP_PORT` | `1025` | Where the mail sink listens for the app |
| `E2E_MAIL_API_PORT` | `8025` | Where the mail sink answers the specs |
| `E2E_MAIL_API` | `http://127.0.0.1:8025` | The sink a spec reads from, when it is not the local one |

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

**Read the link out of the mail, not out of the database.** A token in a table
proves nothing about what the person received; the sink is there so a spec can
follow the address the app actually posted.

**Prefer a role or a stable id over a class.** Where an element has neither, add
`data-testid` to the component rather than reaching through the DOM.
