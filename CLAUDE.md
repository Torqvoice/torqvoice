# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NEVER EVER RUN PRISMA MIGRATE COMMANDS. I WILL NOT TOLERATE ANY PRISMA MIGRATE COMMANDS BEING RUN IN THIS REPOSITORY.
ALL MIGRATIONS SHOULD BE HANDLED BY MYSELF.

Torqvoice is a self-hosted workshop management platform for automotive service businesses. Built with Next.js 16 (App Router), TypeScript, PostgreSQL, and Prisma.

This application will take over for Lubelog and Invoice Ninja, providing a more comprehensive solution for repair shops to manage their work orders, invoices, and customer interactions. The goal is to create a user-friendly platform that streamlines the repair process and enhances communication between repair shops and their customers.


/app directory should only contain routes with server components. Pages should allways be loaded with server components to fetch data before rendering.

Client components should allways be placed in the /features directory. Features should be organized by domain, with each feature having its own subdirectory. Each feature directory can contain components, hooks, styles, actions and tests related to that specific feature.

For server actions, use one action pr file, so each file will be named after the action it contains.

Data Fetching
Data fetching should be done in server components using async/await syntax. This ensures that data is fetched before the component is rendered, improving performance and user experience.

If a client component needs to fetch data, use react-query for efficient data fetching and caching. Allways use zod for schema validation when fetching data.

All server actions should be wrapped with withAuth to ensure that only authenticated users can perform actions that modify data.


## Commands

```bash
npm run dev              # Development server (port 3000)
npm run build            # Production build
npm start                # Start production server
npm run lint             # ESLint check

npx prisma generate      # Generate Prisma client (after schema changes)
npx prisma db push       # Apply schema changes to database
npx prisma studio        # Database GUI browser
npx prisma format        # Format schema file

docker compose up -d     # Start app + PostgreSQL via Docker
docker compose down      # Stop containers
```

No test framework is currently configured.

## Architecture

### Feature-based Organization

The codebase separates server and client concerns:

- **`src/app/`** — Next.js App Router with route groups: `(authenticated)/` for protected pages, `(public)/` for auth/invoice pages, `api/` for API routes
- **`src/features/`** — Domain-driven modules (client components, server actions, schemas)
- **`src/components/`** — Shared UI components (shadcn/ui + custom)
- **`src/lib/`** — Core utilities (auth, database, formatting)
- **`prisma/schema.prisma`** — Single source of truth for database schema (no migration files; uses `db push`)

Routes are flat (no `/dashboard` prefix): `/vehicles`, `/customers`, `/quotes`, `/settings/*`, etc. The home page (`/`) serves the dashboard.

Each feature module (`vehicles/`, `quotes/`, `customers/`, `inventory/`, `billing/`, `payments/`, `team/`, `settings/`, `custom-fields/`, `email/`, `reports/`, `search/`) follows this structure:
- **Actions/** — Server actions (one per file, `"use server"` directive)
- **Schema/** — Zod validation schemas
- **Components/** — React client components

### Server Actions Pattern

All mutations use server actions wrapped with `withAuth()` from `src/lib/with-auth.ts`:

```typescript
"use server";
export const myAction = withAuth(async (userId) => {
  // Zod validation, then Prisma query
  return { success: true, data: result };
});
```

Return type convention: `{ success: boolean; data?: T; error?: string }`

### Authentication

- Better Auth (session-based, 7-day expiration, email/password)
- Server-side: `auth.api.getSession({ headers: await headers() })`
- Client-side: `useSession()` hook from `src/lib/auth-client.ts`
- Config: `src/lib/auth.ts`

### Data Fetching

- **Server components**: Direct Prisma queries via `src/lib/db.ts` (singleton client)
- **Client components**: TanStack React Query with 1-minute stale time (`src/lib/query-provider.tsx`)
- Mutations call `revalidatePath()` to refresh server component data

### PDF Generation

React components rendered to PDF via `@react-pdf/renderer`. Three PDF endpoints:
- `/api/services/[id]/pdf` — Service record invoice
- `/api/quotes/[id]/pdf` — Quote document
- `/api/invoice/[token]/pdf` — Public invoice (no auth required)

Invoice template: `src/features/vehicles/Components/InvoicePDF.tsx`. Supports company branding (logo, colors, fonts) via AppSetting key-value store.

### File Uploads

Separate API routes per upload type (`/api/upload/`, `/api/upload/inventory/`, `/api/upload/service-files/`, `/api/upload/logo/`). Files stored in `public/uploads/[category]/`. Max 5MB, images only (JPEG, PNG, WebP, AVIF) except service files which accept any type.

### Settings System

Key-value store using `AppSetting` model. Keys follow dot notation: `workshop.name`, `workshop.logo`, `invoice.primaryColor`, etc. Accessed via `getSettings([SETTING_KEYS.KEY_NAME])`.

### UI Stack

shadcn/ui (New York style) + Tailwind CSS 4 + Radix UI. Dark mode via `next-themes`. Toast notifications via Sonner. Global search via cmdk command palette (`src/features/search/`). Path alias: `@/*` → `./src/*`.

## Environment Variables

Required: `DATABASE_URL`, `BETTER_AUTH_SECRET` (generate with `openssl rand -hex 32`), `NEXT_PUBLIC_APP_URL`

Optional SMTP config: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM_EMAIL`, `SMTP_REJECT_UNAUTHORIZED`

## Key Files

- `prisma/schema.prisma` — Database schema (22 models)
- `src/lib/auth.ts` — Better Auth configuration
- `src/lib/with-auth.ts` — Auth middleware for server actions
- `src/lib/db.ts` — Prisma client singleton
- `src/components/app-sidebar.tsx` — Main navigation sidebar
- `src/app/layout.tsx` — Root layout with providers
- `next.config.ts` — Standalone output mode (Docker-ready)
