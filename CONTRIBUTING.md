# Contributing

Guides: [Development Setup](https://torqvoice.com/docs/contributing/development) · [Building an Integration](https://torqvoice.com/docs/contributing/building-an-integration) · [Translations](https://torqvoice.com/docs/contributing/translations)

## Issues

- Bugs: [bug report](https://github.com/Torqvoice/torqvoice/issues/new?labels=bug&template=bug_template.yml&title=%5BBug%5D%3A+). Include version, how you run it (cloud, Docker, source) and steps to reproduce.
- Features: [feature request](https://github.com/Torqvoice/torqvoice/issues/new?labels=enhancement&template=feature_request.yml&title=%5BFeature+Request%5D%3A+). Open one before writing anything larger than a small fix, so scope is agreed first.
- Security: never a public issue. Use [private vulnerability reporting](https://github.com/Torqvoice/torqvoice/security/advisories/new) or email post@torqvoice.com.

## Contributor License Agreement

Torqvoice is source-available under the [Elastic License 2.0](LICENSE). Every contributor accepts the [CLA](.github/CLA.md) once: read it, then write `I agree to the CLA` in the description of your first pull request. You keep copyright; the CLA lets Torqvoice license your code on the same terms as the rest of the project. Pull requests from contributors who have not agreed are not merged.

Contributing for an employer or a client who owns the work? They sign the [Corporate CLA](.github/CLA-CORPORATE.md) as well and send it to post@torqvoice.com before the pull request.

## Setup

Dev Container in `.devcontainer/` (recommended), or Node.js 22 and PostgreSQL:

```bash
docker-compose up -d db
cp .env.example .env      # DATABASE_URL, BETTER_AUTH_SECRET, NEXT_PUBLIC_APP_URL
npm install
npx prisma migrate dev
npm run dev               # http://localhost:3000
```

## Layout

| Path | What |
| ---- | ---- |
| `src/app` | Next.js App Router; API under `src/app/api` |
| `src/features/<domain>` | Domain code (quotes, inspections, sms, ...) |
| `src/components`, `src/lib` | Shared UI, utilities |
| `src/integrations/<id>` | One connector per folder: `manifest.ts` + `server.ts`, listed in `registry.ts` |
| `src/__tests__`, `e2e/` | Vitest, Playwright |
| `prisma/` | Schema and migrations |
| `messages/<locale>/` | Translations; English is the source |

## Rules

- Biome formats and lints. `npm run format && npm run lint && npm test` must pass; CI runs the same.
- Files kebab-case, components PascalCase, imports via `@/`.
- All user-facing text through `next-intl`. Add English under `messages/en/`; other locales welcome, not required.
- Store dates in UTC, render in the workshop's timezone via `src/lib/timezone.ts` and `src/lib/workshop-datetime.ts`. No `setHours`/`getDay` on raw `Date` server-side.
- Money carries a currency code; countries ISO 3166-1, languages ISO 639-1.
- Schema changes: `npx prisma migrate dev --name <change>`, migration folder in the PR. Wrap data migrations in `BEGIN`/`COMMIT`.
- Tests assert visible behaviour, under `src/__tests__/**`, `*.test.ts(x)`.
- No secrets. New env vars go in `.env.example` with a comment.
- Country-specific features (registries, tax rules, parts marketplaces) ship as connectors or settings, never as defaults everyone sees.

## Connectors

A connector is `src/integrations/<id>/{manifest.ts,server.ts}`, registered in `src/integrations/registry.ts`, with a logo in `public/images/integrations/`. The docs page on torqvoice.com is written by the maintainer; include the text in the PR description. A test fails if a folder is not registered. Copy the closest existing one: `quickbooks` (accounting), `vegvesen` or `rdw` (registry), `stripe` (payments), `twilio-sms` (messaging). Agree the category and any new capability in an issue first.

## Pull requests

1. Branch from `main`. One change per PR.
2. Imperative title, it becomes the release note: `Add PartsTech parts ordering connector`.
3. Fill the template: what, why, how tested. Screenshots for UI.
4. CI green, CLA agreed, review addressed. The maintainer merges.
