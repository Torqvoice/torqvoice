# Torqvoice Subscription Plans

Same model as Invoice Ninja. One codebase, two modes controlled by env var.

---

## Architecture

Same Torqvoice app runs everywhere. One env var determines the gating logic:

```
TORQVOICE_MODE=cloud        # set on app.torqvoice.com
TORQVOICE_MODE=self-hosted  # default if not set
```

### Cloud mode (`app.torqvoice.com`)
- Plans stored per-organization in the database (free/pro/enterprise)
- Managed via Stripe subscriptions
- Feature gating checks the org's plan

### Self-hosted mode (default)
- Single license key check (valid or not)
- No license = free tier limits
- Valid license = everything unlocked + branding removed
- License validated against `torqvoice.com/api/license/validate`

---

## Cloud-Hosted Plans (app.torqvoice.com)

### Free — $0/year
- Up to 5 customers
- Unlimited vehicles
- Basic invoicing & quotes (2 templates)
- Work order management
- Inventory tracking
- 1 user
- Community support

### Torq Pro — $99/year
- Unlimited customers
- All invoice templates + custom designs
- Reports & analytics
- SMTP / custom email
- API access
- Up to 5 users
- Online payments
- Custom fields
- Priority support

### Enterprise — $140/year
- Everything in Torq Pro
- Up to 50 users
- Priority support

---

## Self-Hosted Plans (GitHub / Docker)

### Free — $0
Core features, same limits as cloud free:
- Up to 5 customers
- Unlimited vehicles
- Basic invoicing & quotes (2 templates)
- Work order management
- Inventory tracking
- 1 user
- "Powered by Torqvoice" branding on PDFs, sidebar, login pages

### White-Label License — $30/year
Unlocks all features + removes branding:
- Unlimited customers
- All invoice templates + custom designs
- Reports & analytics
- SMTP / custom email
- API access
- Unlimited users
- Online payments
- Custom fields
- Remove "Torqvoice" branding from PDFs, sidebar, login pages
- Custom platform name

Purchase page: `torqvoice.com/white-label`

---

## License Key System (Self-Hosted)

Same approach as Invoice Ninja. No hardware ID, no domain binding. Simple server-side validation.

### How Invoice Ninja does it (reference)
1. User purchases white-label license on invoiceninja.com
2. Receives a license key string via email
3. Enters key in self-hosted app: Settings > Account Management
4. App calls `invoicing.co/claim_license?license_key={key}&product_id={id}`
5. Server responds with expiration date (or failure)
6. App stores plan type (`white_label`) and expiry date in local database
7. Key is not tied to hardware or domain — just a random string linked to a purchase record
8. If shared/abused, Invoice Ninja can revoke it server-side

### How Torqvoice does it (our implementation)
1. User purchases white-label license at `torqvoice.com/white-label`
2. Receives a license key string via email
3. Enters key in self-hosted Torqvoice app: Admin > Settings
4. App calls `torqvoice.com/api/license/validate` with the key
5. Server responds with `{ valid: true, plan: "white-label", expiresAt: "..." }`
6. Torqvoice stores in local database (SystemSetting table):
   - `license.key` — the key itself
   - `license.valid` — "true" or "false"
   - `license.plan` — "white-label"
   - `license.checkedAt` — last validation timestamp
7. On subsequent app loads, Torqvoice checks cached validity — no API call needed
8. Re-validates periodically (e.g. on startup or once per day) to catch expirations/revocations

### Key properties
- **Not tied to hardware** — no machine fingerprinting
- **Not tied to domain** — works on any server
- **One key = one license** — random string (cuid) linked to a purchase record on torqvoice.com
- **Server-side revocation** — if a key is shared/abused, we revoke it in the torqvoice.com database, next validation returns `{ valid: false }`
- **Graceful offline** — if torqvoice.com is unreachable, Torqvoice falls back to cached `license.valid` value so the app keeps working
- **Annual renewal** — key expires after 1 year, user gets a new key on renewal (or same key with extended expiry)

### License validation flow

```
Self-hosted Torqvoice                         torqvoice.com
─────────────────────                         ─────────────

User enters key
       │
       ▼
POST /api/license/validate ──────────────────► Check key in License table
  { key: "clx..." }                            - exists?
                                               - status = "active"?
                                               - not expired?
       ◄──────────────────────────────────────
  { valid: true,
    plan: "white-label",
    expiresAt: "2027-02-15" }
       │
       ▼
Store in SystemSetting:
  license.key = "clx..."
  license.valid = "true"
  license.plan = "white-label"
  license.checkedAt = now()
       │
       ▼
Unlock all features
Remove branding
```

### Fallback (API unreachable)

```
Self-hosted Torqvoice                         torqvoice.com
─────────────────────                         ─────────────

POST /api/license/validate ──────── X ────────► (unreachable)

       │
       ▼
Read cached SystemSetting:
  license.valid = "true" (from last check)
       │
       ▼
Keep features unlocked
(will re-validate on next startup)
```

---

## Feature Gating Implementation

One shared gating function, two strategies:

```typescript
// src/lib/features.ts

type Plan = "free" | "pro" | "enterprise" | "white-label";

function getEffectivePlan(): Plan {
  if (process.env.TORQVOICE_MODE === "cloud") {
    // Read from organization's subscription in database
    return orgPlan; // "free" | "pro" | "enterprise"
  } else {
    // Self-hosted: license valid = white-label, otherwise free
    return licenseValid ? "white-label" : "free";
  }
}
```

Feature checks map plan → permissions:

```typescript
const PLAN_FEATURES = {
  free: {
    maxCustomers: 5,
    maxUsers: 1,
    templates: 2,
    reports: false,
    smtp: false,
    api: false,
    payments: false,
    customFields: false,
    brandingRemoved: false,
    customPlatformName: false,
  },
  pro: {
    maxCustomers: Infinity,
    maxUsers: 5,
    templates: Infinity,
    reports: true,
    smtp: true,
    api: true,
    payments: true,
    customFields: true,
    brandingRemoved: false,
    customPlatformName: false,
  },
  enterprise: {
    maxCustomers: Infinity,
    maxUsers: 50,
    templates: Infinity,
    reports: true,
    smtp: true,
    api: true,
    payments: true,
    customFields: true,
    brandingRemoved: false,
    customPlatformName: false,
  },
  "white-label": {
    maxCustomers: Infinity,
    maxUsers: Infinity,
    templates: Infinity,
    reports: true,
    smtp: true,
    api: true,
    payments: true,
    customFields: true,
    brandingRemoved: true,
    customPlatformName: true,
  },
};
```

Usage in the app:

```typescript
// In a server component or action
const plan = await getEffectivePlan();
const features = PLAN_FEATURES[plan];

if (!features.reports) {
  // Hide reports nav item / return 403
}

if (customerCount >= features.maxCustomers) {
  // Block creating new customers, show upgrade prompt
}
```

---

## What Users See

### Self-hosted admin settings
- White-Label License section (key input + validate)
- Without license: "Upgrade to unlock all features" prompt
- With license: "All features unlocked" badge

### Cloud admin / billing page
- Current plan badge (Free / Pro / Enterprise)
- Upgrade/downgrade buttons → Stripe checkout
- Usage stats (customers, users vs plan limits)

### torqvoice.com marketing site
- Landing page (`/#pricing`): 3-tier cloud plans
- White-label page (`/white-label`): Purchase page for self-hosted users

---

## License Model (torqvoice.com database)

```
License {
  key       — unique license key (cuid, e.g. "clx8f7g2k0001...")
  email     — customer email
  status    — active | expired | revoked
  plan      — pro | enterprise | white-label
  expiresAt — expiration date (1 year from purchase)
}
```

- `plan: "pro"` / `"enterprise"` — cloud subscription licenses (managed by Stripe webhooks)
- `plan: "white-label"` — self-hosted white-label licenses

---

## Summary

|                        | Self-Hosted Free | Self-Hosted Licensed | Cloud Free | Cloud Pro | Cloud Enterprise |
|------------------------|:----------------:|:--------------------:|:----------:|:---------:|:----------------:|
| Price                  | $0               | $30/yr               | $0         | $99/yr    | $140/yr          |
| Customers              | 5                | Unlimited            | 5          | Unlimited | Unlimited        |
| Vehicles               | Unlimited        | Unlimited            | Unlimited  | Unlimited | Unlimited        |
| Users                  | 1                | Unlimited            | 1          | 5         | 50               |
| Invoice Templates      | 2                | All                  | 2          | All       | All              |
| Reports & Analytics    | No               | Yes                  | No         | Yes       | Yes              |
| SMTP / Custom Email    | No               | Yes                  | No         | Yes       | Yes              |
| API Access             | No               | Yes                  | No         | Yes       | Yes              |
| Online Payments        | No               | Yes                  | No         | Yes       | Yes              |
| Custom Fields          | No               | Yes                  | No         | Yes       | Yes              |
| Branding Removed       | No               | Yes                  | No         | No        | No               |
| Custom Platform Name   | No               | Yes                  | No         | No        | No               |
