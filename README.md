<br />
<p align="center">
	<a href="https://github.com/sinamics/torqvoice">
		<img src="assets/logo/torqvoice_app_logo_padding.png" alt="Torqvoice Logo" width="120" height="120">
	</a>

   <p align="center">
   	Torqvoice — modern workshop and service management.
   	<br />
   	<br />
   	<a href="https://github.com/sinamics/torqvoice/issues/new?labels=bug&template=bug_template.yml&title=%5BBug%5D%3A+">Bug Report</a>
   	·
   	<a href="https://github.com/sinamics/torqvoice/issues/new?labels=enhancement&template=feature_request.yml&title=%5BFeature+Request%5D%3A+">Feature Request</a>
   </p>

   <div align="center">

<!-- [![CI](https://github.com/sinamics/torqvoice/actions/workflows/ci.yml/badge.svg)](https://github.com/sinamics/torqvoice/actions)
[![Release](https://img.shields.io/github/v/release/sinamics/torqvoice.svg)](https://github.com/sinamics/torqvoice/releases/latest)
[![License](https://img.shields.io/github/license/sinamics/torqvoice.svg)](LICENSE) -->

   </div>

</p>
<br />

Torqvoice is a self-hosted workshop management platform built for automotive service businesses. It replaces scattered tools with a single place to manage customers, vehicles, service records, quotes, invoicing, inventory, and billing — all with a clean modern UI.

## Deploy with Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  app:
    image: ghcr.io/torqvoice/torqvoice:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://torqvoice:torqvoice@db:5432/torqvoice
      - BETTER_AUTH_SECRET=change-me-run-openssl-rand-hex-32
      - NEXT_PUBLIC_APP_URL=http://localhost:3000
    volumes:
      - uploads:/app/data/uploads
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - postgres-data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: torqvoice
      POSTGRES_PASSWORD: torqvoice
      POSTGRES_DB: torqvoice
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U torqvoice"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
  uploads:
```

```bash
# Generate a proper auth secret, and replace the placeholder in the compose file
openssl rand -hex 32

# Start everything
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) and create your first account.

## Features
- **Multi Company Support** — manage multiple workshops with a single login
- **Vehicles & Customers** — full service history per vehicle, linked to customer profiles
- **Work Orders** — status-driven workflow (pending, in progress, waiting parts, ready, completed)
- **Quotes & Invoicing** — PDF generation, customizable templates, public shareable invoice links
- **Inventory** — parts stock tracking with suppliers and low-stock alerts
- **Billing & Payments** — payment tracking with paid/partial/unpaid status
- **Reports** — revenue, service, customer, and inventory analytics with charts and CSV export
- **Email** — send quotes and invoices with PDF attachments
- **Custom Fields** — extend service records and quotes with your own data fields
- **Team Management** — organization-based roles (owner, admin, member)
- **Company Branding** — logo, invoice colors, fonts, and layout customization
- **Global Search** — search across all entities via command palette
- **Dark Mode** — full dark mode support

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Auth secret (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Application URL |

## License

[Elastic License 2.0 (ELv2)](LICENSE)
