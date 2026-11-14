# Torqvoice, for coding agents

Torqvoice is workshop management for automotive (and marine) service businesses: customers,
vehicles, work orders, quotes, invoices, inventory, inspections, messaging, bookkeeping sync.
One codebase runs both the self-hosted install and Torqvoice Cloud, where each workshop is an
organization. Next.js 16 App Router, TypeScript, PostgreSQL, Prisma 7, Better Auth, next-intl,
Tailwind 4 with shadcn/ui, Biome, Vitest, Playwright. Licensed under the Elastic License 2.0.

User docs live at https://torqvoice.com/docs and are written by the maintainer, not in this repo.
`CONTRIBUTING.md` has setup, the CLA and the pull request rules; this file is what you need
while writing code and cannot see from the code itself.

## Commands

Open the repo in the Dev Container (`.devcontainer/`) and everything below works as is: Node 22,
Postgres 16 as the `db` service on 5432, pgAdmin on 8080, Biome formatting on save. Outside it
you need Node 22 and your own Postgres (`docker-compose up -d db`), then `cp .env.example .env`.

```bash
npm run dev                 # http://localhost:3000, needs DATABASE_URL in .env
npm run check               # Biome lint + format check, what CI runs (check:fix writes)
npm test                    # Vitest, jsdom, Prisma mocked
npx vitest run src/__tests__/<path>.test.tsx     # one test file
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit   # typecheck; without the flag it runs out of memory
npm run test:db             # the few tests that need Postgres; E2E_DATABASE_URL must contain "test" or "e2e"
npm run test:e2e            # Playwright against a built app and a real database, see e2e/README.md
npx prisma generate         # after a fresh clone or a schema change; output is src/generated (gitignored)
npx prisma migrate dev --name <change>   # schema change; commit the folder it creates
```

Formatting is Biome only. There is no ESLint or Prettier config; running Prettier rewrites
whole files. Schema changes go through `prisma migrate dev` and a reviewed migration folder,
never `prisma migrate deploy` or `prisma db push`.

## Gotchas

- A git worktree of this repo needs `node_modules` and `src/generated` symlinked from the main
  checkout before Vitest or `tsc` will run there.
- `.env.example` sets `DATABASE_URL` to host `db`, which resolves inside the Dev Container.
  Outside it, change the host to `localhost`.

## Where things are

| Path | What |
| --- | --- |
| `src/app/(authenticated)` | Signed-in pages. Server components fetch with Prisma, then hand data to a client component. |
| `src/app/(public)`, `(designer)`, `(presenter)` | Auth, portal and share links; the invoice and email designers; the work board for a wall screen. |
| `src/app/api` | Route handlers: webhooks, PDFs, uploads, the technician app API under `v1/tech`, WebSockets. |
| `src/features/<domain>/` | `Actions/` server actions, `Components/` client components, `Schema/` zod, `Lib/` helpers. |
| `src/components/ui` | shadcn primitives. Shared app components sit one level up. |
| `src/lib` | Auth, database, permissions, money, dates, realtime, backup, cron. |
| `src/integrations/<id>/` | One connector per folder: `manifest.ts` + `server.ts`, listed in `registry.ts`. A test fails if a folder is missing from the registry. |
| `prisma/schema/*.prisma` | The schema, split by area. `prisma/migrations/` is history; never edit an applied one. |
| `messages/<locale>/<namespace>.json` | Translations. English is the source; other locales may lag. |
| `src/__tests__/` | Vitest, mirroring `src/`. `e2e/specs/` is Playwright. |

### The app directory

Every `page.tsx` and `layout.tsx` in `src/app` is a server component: it reads the session,
fetches with Prisma or a feature's action, and renders. A page that needs interactivity hands
its data to a client component. One that belongs only to that page may sit beside it as
`<route>-client.tsx`; anything reused lives in `src/features`. Route groups set the shell:

```
src/app/
├── (authenticated)/          # signed-in workshop, layout.tsx has the sidebar and session
│   ├── page.tsx              # dashboard
│   ├── vehicles/             # list, [id], [id]/service/new and [serviceId]; a work order is a service record
│   ├── sales/                # counter sales: a work order without a vehicle
│   ├── settings/             # one folder per settings page, settings-nav.tsx lists them
│   └── admin/                # platform admin, super admins only
├── (public)/                 # nobody signed in, every page is token or code gated
│   ├── auth/                 # sign-in, sign-up, 2FA, email verification, password reset
│   ├── onboarding/  app-setup/
│   ├── portal/[orgId]/       # the customer portal
│   ├── share/                # invoice, quote, inspection, status-report, terms by link
│   ├── p/[token]             # a phone opened from a work order's "Add from phone" code
│   └── b/[token]             # an online booking
├── (designer)/               # invoice-designer and email-designer, full-screen canvas
├── (presenter)/work-board/   # the work board for a wall screen
├── api/
│   ├── protected/            # route handlers for the signed-in app: uploads, files, ws, AI, backup
│   ├── public/               # share links, portal, tracking pixels, images
│   ├── webhooks/             # stripe, paypal, vipps, email, sms, whatsapp, telegram
│   ├── integrations/[connector]/   # OAuth callbacks for connectors
│   ├── v1/                   # tech (the technician app), cron, health
│   └── system/               # backup-heartbeat
├── layout.tsx                # root: providers, theme, locale
└── globals.css               # theme tokens for light, dark and the colour themes
```

API routes are for what cannot be a server action: a browser upload, a webhook, a PDF, a
WebSocket, the technician app. Everything else goes through an action.

## How code is written here

**Server actions** are the only write path. Each lives in its own file under
`src/features/<domain>/Actions/`, is wrapped with `withAuth` from `src/lib/with-auth.ts`, and
returns `ActionResult<T>` (`{ success, data?, error?, gated?, forbidden? }`). `withAuth` hands
you `ctx.organizationId`; every Prisma query is scoped by it, including lookups by id, because
ids from the browser can belong to another workshop. Pass `requiredPermissions` when the
action is not for everyone; `src/lib/permissions.ts` lists them. Validate input with zod
before touching the database.

**Four things an action may also need.** An action that changes a document, money or access
passes `audit` to `withAuth` (`src/lib/audit.ts` has the event shape; 75 actions do this).
One that sends a message or email or calls a paid service starts with `demoGuard()` from
`src/lib/demo.ts`, because the public demo runs with real provider credentials; a test lists
every unguarded one and fails. One a cloud plan may refuse returns `gated`, and the screen
passes the result to `handleGated` from `src/components/upgrade-gate` before showing an error.
And wording that names the vehicle has two forms: `useServiceType()` from
`src/components/service-type-context` says whether this workshop fixes cars or boats, and the
strings for both live side by side (`title` and `titleMarine`).

**Action names are an API.** A tab opened before a deploy calls the new build with what the
old page sends. Changing what an action takes, or what its input means, means a new action
name; the old tab is then asked to reload instead of writing bad data.

**Reads** happen in server components with `db` from `src/lib/db.ts`. A client component that
must fetch uses TanStack Query (`src/lib/query-provider.tsx`) and parses the answer with zod.

**Every string the user sees goes through next-intl.** Add the English under `messages/en/`
in the namespace that owns the screen and read it with `useTranslations`. Playwright specs
and the docs find buttons by their English words, so changing copy is a visible change, not
a cleanup.

**Dates and money.** The database holds UTC. Render in the workshop's time zone through
`src/lib/timezone.ts` and `src/lib/workshop-datetime.ts`; no `setHours` or `getDay` on a raw
`Date` on the server. Amounts carry a currency code (`src/lib/money.ts`), countries are
ISO 3166-1, languages ISO 639-1.

**Nothing country-specific by default.** Registries, tax rules, payment providers and parts
sources ship as connectors or settings a workshop turns on, never as behaviour everyone sees.

**UI.** Use the shadcn components and the theme tokens (`bg-background`, `text-muted-foreground`,
`border`): the app has dark mode and six colour themes defined in `src/app/globals.css`, so a
hard-coded colour is wrong in most of them. A dialog with a long form uses `DialogHeader`,
`DialogBody` and `DialogFooter` from `src/components/ui/dialog`, so the buttons stay pinned
while the fields scroll. Client components are `"use client"` files in `src/features`;
pages in `src/app` stay server components.

**Naming.** `src/components` and `src/lib` are kebab-case files. Inside `src/features` the
folders are `Actions`, `Components`, `Schema`, `Lib` and component files are PascalCase.
Imports use `@/`.

## Tests

Vitest tests assert what a user would notice, not implementation details, and mock Prisma;
`src/__tests__/setup.ts` wires next-intl. Anything that only breaks with the pieces assembled
(migrations, cookies, forms wired to actions, invoice numbering) is a Playwright spec. CI runs
`npm run check`, `npm test` and the e2e suite in eight shards on every pull request.

## Pull requests

One change per PR, imperative title (it becomes the release note), body from
`.github/PULL_REQUEST_TEMPLATE.md`: Summary, Why, Testing. First-time contributors keep the
CLA line; the maintainer deletes it. Screenshots for UI changes. Before opening:
`npm run check && npm test`.
